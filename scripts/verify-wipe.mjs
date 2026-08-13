/**
 * 데이터 폐기가 "매직링크만 요청하고 안 들어온 사람"까지 지우는지 검증.
 *
 * 이 사람들은 auth.users 에는 있지만 public.users 에는 없다.
 * public.users 를 기준으로 순회하면 영구히 남고, 개인정보 처리방침의
 * "전량 파기" 약속이 지켜지지 않는다.
 *
 * wipe-data 라우트의 삭제 알고리즘을 그대로 재현해 검증한다.
 * (HTTP 인증 계층은 다른 어드민 라우트와 동일하므로 여기서는 다루지 않는다)
 *
 * 실행: node --env-file=.env.local scripts/verify-wipe.mjs
 */
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? "").toLowerCase();
const isAdminEmail = (e) => !!e && !!ADMIN_EMAIL && e.toLowerCase() === ADMIN_EMAIL;

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? "  -> " + detail : ""}`); }
};

const { data: existing } = await admin.from("users").select("id");
if ((existing ?? []).length > 5) {
  console.error(`중단: 사용자 ${existing.length}명. 실제 참가자가 있는 DB로 보인다.`);
  process.exit(1);
}
if (!ADMIN_EMAIL) {
  console.error("ADMIN_EMAIL 이 없어 어드민 보존 여부를 검증할 수 없다.");
  process.exit(1);
}

// 폐기는 되돌릴 수 없으므로 기존 테스트 계정을 먼저 떠둔다.
// 검증이 끝나면 그대로 복원해서, 이 스크립트를 돌려도 상태가 바뀌지 않게 한다.
const { data: snapUsers } = await admin.from("users").select("*");
const { data: snapCards } = await admin.from("cards").select("*");
console.log(`기존 상태 스냅샷 — 사용자 ${snapUsers?.length ?? 0} / 카드 ${snapCards?.length ?? 0}`);

// 링크만 요청하고 안 들어온 사람 3명을 만든다 (public.users 행 없음)
const ORPHANS = ["wipe-orphan-1@cju.ac.kr", "wipe-orphan-2@cju.ac.kr", "wipe-orphan-3@cju.ac.kr"];
for (const email of ORPHANS) {
  await admin.auth.admin.createUser({ email, email_confirm: true });
}
console.log(`고아 계정 ${ORPHANS.length}건 생성 (auth.users 에만 존재)\n`);

const before = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
const orphansBefore = before.data.users.filter((u) => ORPHANS.includes(u.email)).length;
check("사전 조건: 고아 계정이 auth.users 에 존재한다", orphansBefore === 3, `${orphansBefore}건`);

// ── wipe-data 의 auth 삭제 알고리즘 재현 ──────────────────────────────
let deletedCount = 0;
const errors = [];
for (let round = 0; round < 50; round++) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) { errors.push(error.message); break; }
  const targets = (data?.users ?? []).filter((u) => !isAdminEmail(u.email));
  if (targets.length === 0) break;

  let progressed = false;
  for (const u of targets) {
    const { error: delError } = await admin.auth.admin.deleteUser(u.id);
    if (delError) errors.push(delError.message);
    else { deletedCount++; progressed = true; }
  }
  if (!progressed) { errors.push("진행 없음"); break; }
}
// ────────────────────────────────────────────────────────────────────

const after = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
const left = after.data.users;
const orphansLeft = left.filter((u) => ORPHANS.includes(u.email)).length;
const adminLeft = left.filter((u) => isAdminEmail(u.email)).length;

console.log();
check("고아 계정이 전부 삭제된다", orphansLeft === 0, `${orphansLeft}건 남음`);
check("어드민 계정은 보존된다", adminLeft === 1, `${adminLeft}건`);
check("어드민 외에는 아무도 남지 않는다", left.length === adminLeft, `총 ${left.length}건 남음`);
check("삭제 중 오류가 없다", errors.length === 0, errors.join(" / "));

console.log(`\n삭제된 auth 계정: ${deletedCount}건`);

// ── 스냅샷 복원 ──────────────────────────────────────────────────────
// auth 계정을 같은 uuid 로 되살릴 수는 없으므로 새로 만들고,
// public.users / cards 를 새 id 로 다시 심는다.
const idMap = new Map();
for (const u of snapUsers ?? []) {
  const { data, error } = await admin.auth.admin.createUser({
    email: u.email, email_confirm: true,
  });
  if (error) { console.log(`  복원 실패(auth): ${u.email} — ${error.message}`); continue; }
  idMap.set(u.id, data.user.id);
  await admin.from("users").insert({ ...u, id: data.user.id });
}
for (const c of snapCards ?? []) {
  const newOwner = idMap.get(c.user_id);
  if (!newOwner) continue;
  const { id: _drop, ...rest } = c;
  await admin.from("cards").insert({ ...rest, user_id: newOwner });
}
const { count: uAfter } = await admin.from("users").select("id", { count: "exact", head: true });
const { count: cAfter } = await admin.from("cards").select("id", { count: "exact", head: true });
check("검증 전 테스트 계정이 복원된다",
  uAfter === (snapUsers?.length ?? 0) && cAfter === (snapCards?.length ?? 0),
  `사용자 ${uAfter}/${snapUsers?.length ?? 0} · 카드 ${cAfter}/${snapCards?.length ?? 0}`);

await admin.from("session_config").update({ force_locked: true }).eq("id", 1);

console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
console.log(`복원 완료 — 사용자 ${uAfter} / 카드 ${cAfter} · 보드 잠금`);
process.exit(fail === 0 ? 0 : 1);
