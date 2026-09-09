import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext, isAdminUser } from "@/lib/auth";
import { requireAjaxRequest } from "@/lib/csrf";

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
    const MAX_ROUNDS = 50;
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      if (error) {
        errors.push(`listUsers: ${error.message}`);
        break;
      }
      const targets = (data?.users ?? []).filter((candidate) => !isAdminUser(candidate));
      if (targets.length === 0) break;

      let progressed = false;
      for (const target of targets) {
        const { error: deleteError } = await admin.auth.admin.deleteUser(target.id);
        if (deleteError) {
          errors.push(`deleteUser(${target.id.slice(0, 8)}): ${deleteError.message}`);
        } else {
          deletedAuthUsers++;
          progressed = true;
        }
      }
      if (!progressed) {
        errors.push(`auth 계정 ${targets.length}건을 삭제하지 못했습니다`);
        break;
      }
    }
  }

  const afterResult = await admin.rpc("event_purge_status");
  const after = firstRow<PurgeStatus>(afterResult.data);
  if (afterResult.error || !after) {
    errors.push(`status(after): ${afterResult.error?.message ?? "missing result"}`);
  }

  const { data: authAfter, error: authAfterError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (authAfterError) errors.push(`listUsers(final): ${authAfterError.message}`);
  const remainingAuth = authAfterError
    ? null
    : (authAfter?.users ?? []).filter((candidate) => !isAdminUser(candidate)).length;

  const databaseClean = !!after && Object.values(after).every((count) => count === 0);
  if (errors.length === 0 && databaseClean && remainingAuth === 0) {
    const finish = await admin.rpc("finish_event_purge");
    if (finish.error) errors.push(`finish: ${finish.error.message}`);
  }

  const clean = errors.length === 0 && databaseClean && remainingAuth === 0;
  return NextResponse.json(
    {
      ok: clean,
      deleted: {
        matches: before.matches,
        cards: before.cards,
        users: before.users,
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
