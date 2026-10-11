import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext, isAdminUser } from "@/lib/auth";
import { requireAjaxRequest } from "@/lib/csrf";
import { accountRetentionCutoff } from "@/lib/account-retention";

type PurgeStatus = {
  matches: number;
  cards: number;
  users: number;
  banned_emails: number;
  throttles: number;
  participants: number;
};

const MAX_AUTH_DELETES_PER_REQUEST = 100;
const AUTH_PAGE_SIZE = 100;

function firstRow<T>(value: T[] | T | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * 행사 내용을 먼저 잠근 뒤 지운다. Auth API 삭제는 DB 트랜잭션에 묶을 수 없으므로
 * 한 요청에서 삭제할 계정 수를 제한하고, 완료될 때까지 purging 상태를 유지한다.
 * 동일한 관리자 요청을 다시 보내면 남은 계정부터 안전하게 이어서 처리한다.
 */
export async function POST(req: Request) {
  const csrfError = requireAjaxRequest(req);
  if (csrfError) return csrfError;
  const { user } = await getAdminContext();
  if (!user) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== "WIPE") {
    return NextResponse.json({ error: "CONFIRMATION_REQUIRED" }, { status: 400 });
  }

  const admin = createAdminClient();
  const errors: string[] = [];
  const emptyStatus: PurgeStatus = {
    matches: 0,
    cards: 0,
    users: 0,
    banned_emails: 0,
    throttles: 0,
    participants: 0,
  };

  const beforeResult = await admin.rpc("event_purge_status");
  const before = firstRow<PurgeStatus>(beforeResult.data) ?? emptyStatus;
  if (beforeResult.error) errors.push(`status(before): ${beforeResult.error.message}`);

  const begin = await admin.rpc("begin_event_purge");
  if (begin.error) errors.push(`begin: ${begin.error.message}`);

  if (errors.length === 0) {
    const purge = await admin.rpc("purge_current_event_data");
    if (purge.error) errors.push(`database: ${purge.error.message}`);
  }

  let deletedAuthUsers = 0;
  let pendingAccountCleanup = false;
  let pendingProfileCount: number | null = null;
  let budget = MAX_AUTH_DELETES_PER_REQUEST;

  if (errors.length === 0) {
    // WHERE 없는 SELECT는 PostgREST의 max_rows(이 프로젝트는 1000)에 잘린다.
    // 삭제하면서 offset을 넘겨도 행이 당겨져 누락되므로, 항상 첫 대상 배치를 읽는다.
    const cutoff = accountRetentionCutoff().toISOString();
    for (const kind of ["no_consent", "expired"] as const) {
      if (budget === 0 || errors.length > 0) break;
      const query = admin.from("users").select("id");
      const result = kind === "no_consent"
        ? await query.is("retention_accepted_at", null).limit(budget)
        : await query.lt("last_active_at", cutoff).limit(budget);
      if (result.error) {
        errors.push(`accounts(${kind}): ${result.error.message}`);
        break;
      }

      for (const account of result.data ?? []) {
        const { error } = await admin.auth.admin.deleteUser(account.id);
        if (error) {
          errors.push(`deleteUser(${account.id.slice(0, 8)}): ${error.message}`);
          break;
        }
        deletedAuthUsers++;
        budget--;
      }
    }

    if (errors.length === 0) {
      // 완료 판정은 반환된 행 수가 아니라 서버의 정확한 count로 한다.
      const [noConsent, expired] = await Promise.all([
        admin.from("users").select("id", { count: "exact", head: true })
          .is("retention_accepted_at", null),
        admin.from("users").select("id", { count: "exact", head: true })
          .lt("last_active_at", cutoff),
      ]);
      if (noConsent.error || expired.error || noConsent.count === null || expired.count === null) {
        errors.push("accounts(remaining): count failed");
      } else {
        pendingProfileCount = noConsent.count + expired.count;
        pendingAccountCleanup = pendingProfileCount > 0;
      }
    }

    // 보유 동의 이전에 발송된 매직링크는 auth.users만 만들 수 있다. Auth 전체를
    // 페이지별로 읽고 각 페이지의 프로필 유무를 확인한다. 목록을 순회하는 동안
    // 삭제하면 page offset이 밀리므로 현재 페이지 검색을 끝낸 뒤 삭제한다.
    if (errors.length === 0 && !pendingAccountCleanup) {
      if (budget === 0) {
        pendingAccountCleanup = true;
      } else {
        for (let page = 1; ; page++) {
          const { data, error } = await admin.auth.admin.listUsers({ page, perPage: AUTH_PAGE_SIZE });
          if (error || !data || !Array.isArray(data.users)) {
            errors.push(`listUsers: ${error?.message ?? "missing users"}`);
            break;
          }

          const candidates = data.users.filter((candidate) => !isAdminUser(candidate));
          if (candidates.length > 0) {
            const { data: profiles, error: profileError } = await admin
              .from("users")
              .select("id")
              .in("id", candidates.map((candidate) => candidate.id));
            if (profileError) {
              errors.push(`accounts(auth page ${page}): ${profileError.message}`);
              break;
            }
            const profileIds = new Set((profiles ?? []).map((profile) => profile.id));
            const orphans = candidates.filter((candidate) => !profileIds.has(candidate.id));
            if (orphans.length > 0) {
              pendingAccountCleanup = true;
              for (const orphan of orphans.slice(0, budget)) {
                const { error: deleteError } = await admin.auth.admin.deleteUser(orphan.id);
                if (deleteError) {
                  errors.push(`deleteUser(${orphan.id.slice(0, 8)}): ${deleteError.message}`);
                  break;
                }
                deletedAuthUsers++;
                budget--;
              }
              // 다시 실행해 전체 Auth 목록을 재검증한 뒤에만 완료한다.
              break;
            }
          }

          if (data.users.length < AUTH_PAGE_SIZE) break;
        }
      }
    }
  }

  const afterResult = await admin.rpc("event_purge_status");
  const after = firstRow<PurgeStatus>(afterResult.data);
  if (afterResult.error || !after) {
    errors.push(`status(after): ${afterResult.error?.message ?? "missing result"}`);
  }

  const eventDataClean = !!after &&
    after.matches === 0 &&
    after.cards === 0 &&
    after.banned_emails === 0 &&
    after.throttles === 0 &&
    after.participants === 0;
  if (errors.length === 0 && eventDataClean && !pendingAccountCleanup) {
    const finish = await admin.rpc("finish_event_purge");
    if (finish.error) errors.push(`finish: ${finish.error.message}`);
  }

  const clean = errors.length === 0 && eventDataClean && !pendingAccountCleanup;
  return NextResponse.json(
    {
      ok: clean,
      deleted: {
        matches: before.matches,
        cards: before.cards,
        users: deletedAuthUsers,
        authUsers: deletedAuthUsers,
        bannedEmails: before.banned_emails,
        throttles: before.throttles,
        participants: before.participants,
      },
      remaining: {
        matches: after?.matches ?? null,
        cards: after?.cards ?? null,
        users: after?.users ?? null,
        authUsers: after?.users ?? null,
        bannedEmails: after?.banned_emails ?? null,
        throttles: after?.throttles ?? null,
        participants: after?.participants ?? null,
        pendingProfileCount,
        pendingAccountCleanup,
      },
      errors: pendingAccountCleanup && errors.length === 0
        ? ["계정 정리가 진행 중입니다. 같은 작업을 다시 실행하세요."]
        : errors,
    },
    { status: clean ? 200 : errors.length === 0 && eventDataClean ? 202 : 500 },
  );
}
