import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/auth";
import { requireAjaxRequest } from "@/lib/csrf";
import { isAccountRetentionExpired } from "@/lib/account-retention";

type PurgeStatus = {
  matches: number;
  cards: number;
  users: number;
  banned_emails: number;
  throttles: number;
  participants: number;
};

function firstRow<T>(value: T[] | T | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * DB 쓰기를 먼저 잠그고 참가자 데이터를 한 트랜잭션에서 비운다. Auth API는
 * PostgreSQL 트랜잭션에 포함할 수 없으므로, 실패하면 purging 상태를 유지해
 * 신규 참가를 막고 같은 요청을 안전하게 재실행할 수 있게 한다.
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
  if (errors.length === 0) {
    // 보유에 동의하지 않았거나 마지막 참여 후 6개월이 지난 계정만 지운다.
    // 회차 카드·연락처·매칭은 위 DB RPC에서 이미 모두 파기됐다.
    const { data: accounts, error: accountsError } = await admin
      .from("users")
      .select("id, last_active_at, retention_accepted_at");
    if (accountsError) {
      errors.push(`accounts: ${accountsError.message}`);
    } else {
      const targets = (accounts ?? []).filter((account) => {
        return !account.retention_accepted_at || isAccountRetentionExpired(account.last_active_at);
      });
      for (const target of targets) {
        const { error: deleteError } = await admin.auth.admin.deleteUser(target.id);
        if (deleteError) {
          errors.push(`deleteUser(${target.id.slice(0, 8)}): ${deleteError.message}`);
        } else {
          deletedAuthUsers++;
        }
      }
    }
  }

  const afterResult = await admin.rpc("event_purge_status");
  const after = firstRow<PurgeStatus>(afterResult.data);
  if (afterResult.error || !after) {
    errors.push(`status(after): ${afterResult.error?.message ?? "missing result"}`);
  }

  // public.users는 auth.users를 ON DELETE CASCADE로 참조하므로 남은 프로필 수가
  // 바로 보유 중인 인증 계정 수다. Auth 목록 전체를 다시 순회하지 않는다.
  const remainingAuth = after?.users ?? null;

  const eventDataClean = !!after &&
    after.matches === 0 &&
    after.cards === 0 &&
    after.banned_emails === 0 &&
    after.throttles === 0 &&
    after.participants === 0;
  if (errors.length === 0 && eventDataClean) {
    const finish = await admin.rpc("finish_event_purge");
    if (finish.error) errors.push(`finish: ${finish.error.message}`);
  }

  const clean = errors.length === 0 && eventDataClean;
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
        authUsers: remainingAuth,
        bannedEmails: after?.banned_emails ?? null,
        throttles: after?.throttles ?? null,
        participants: after?.participants ?? null,
      },
      errors,
    },
    { status: clean ? 200 : 500 }
  );
}
