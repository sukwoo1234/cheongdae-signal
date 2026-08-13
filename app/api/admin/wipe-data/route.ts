import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/auth";

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

/**
 * 전체 데이터 폐기.
 *
 * 예전에는 public.users 를 훑어 auth 계정을 지웠는데, 그러면 **매직링크만 요청하고
 * 링크를 클릭하지 않은 사람**이 영구히 남는다. 그 사람은 auth.users 에는 있지만
 * public.users 에는 없기 때문이다. 개인정보 처리방침이 "전량 파기"를 약속하고
 * 있으므로 auth 쪽을 기준으로 열거해야 한다.
 *
 * 또 모든 오류를 무시하고 무조건 ok:true 를 반환해서, 폐기가 실패해도
 * 운영자는 성공한 줄 알았다. 실패를 그대로 보고한다.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const admin = createAdminClient();
  const errors: string[] = [];
  const deleted = { matches: 0, cards: 0, users: 0, authUsers: 0, bannedEmails: 0 };

  const countOf = async (table: string) => {
    const { count } = await admin.from(table).select("*", { count: "exact", head: true });
    return count ?? 0;
  };

  deleted.matches = await countOf("matches");
  deleted.cards = await countOf("cards");
  deleted.users = await countOf("users");
  deleted.bannedEmails = await countOf("banned_emails");

  const del = async (table: string, column: string, sentinel: string) => {
    const { error } = await admin.from(table).delete().neq(column, sentinel);
    if (error) errors.push(`${table}: ${error.message}`);
  };

  await del("matches", "id", NIL_UUID);
  await del("cards", "id", NIL_UUID);
  await del("users", "id", NIL_UUID);
  await del("banned_emails", "email", "");

  const { error: throttleError } = await admin.rpc("purge_magic_link_throttle");
  if (throttleError) errors.push(`throttle: ${throttleError.message}`);

  // auth 계정은 전부 훑어야 한다. public.users 를 기준으로 삼으면
  // 매직링크만 요청하고 클릭하지 않은 사람이 영구히 남는다.
  //
  // 삭제하면 목록이 줄어 페이지가 밀리므로 항상 첫 페이지를 다시 읽는다.
  // 반복 횟수는 별도 카운터로 제한한다 — 삭제가 계속 실패하면
  // 같은 배치를 무한히 다시 읽게 되기 때문이다.
  const MAX_ROUNDS = 50;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) {
      errors.push(`listUsers: ${error.message}`);
      break;
    }
    const targets = (data?.users ?? []).filter((u) => !isAdminEmail(u.email));
    if (targets.length === 0) break;

    let progressed = false;
    for (const u of targets) {
      const { error: delError } = await admin.auth.admin.deleteUser(u.id);
      if (delError) {
        errors.push(`deleteUser(${u.id.slice(0, 8)}): ${delError.message}`);
      } else {
        deleted.authUsers++;
        progressed = true;
      }
    }

    // 한 명도 못 지웠으면 다시 돌아도 결과가 같다.
    if (!progressed) {
      errors.push(`auth 계정 ${targets.length}건을 삭제하지 못했습니다`);
      break;
    }
    if (round === MAX_ROUNDS - 1) {
      errors.push("auth 계정이 너무 많아 한 번에 끝내지 못했습니다. 다시 실행하세요");
    }
  }

  // 실제로 비었는지 확인한다. 성공 응답이 곧 검증이어야 한다.
  const remaining = {
    matches: await countOf("matches"),
    cards: await countOf("cards"),
    users: await countOf("users"),
    bannedEmails: await countOf("banned_emails"),
  };
  const { data: authAfter } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const remainingAuth = (authAfter?.users ?? []).filter((u) => !isAdminEmail(u.email)).length;

  const clean =
    errors.length === 0 &&
    Object.values(remaining).every((n) => n === 0) &&
    remainingAuth === 0;

  return NextResponse.json(
    {
      ok: clean,
      deleted,
      remaining: { ...remaining, authUsers: remainingAuth },
      errors,
    },
    { status: clean ? 200 : 500 }
  );
}
