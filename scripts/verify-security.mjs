/**
 * 실제 Supabase에 붙어서 RLS/권한이 의도대로 걸렸는지 검증한다.
 * 앱 라우트를 거치지 않고 PostgREST를 직접 호출한다 — 공격자와 같은 경로다.
 *
 * 실행: node --env-file=.env.local scripts/verify-security.mjs
 *
 * 테스트 계정 2명(남/여)과 각자의 카드가 DB에 있어야 한다.
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !ANON || !SERVICE) {
  console.error("환경변수 누락. node --env-file=.env.local 로 실행하세요.");
  process.exit(1);
}

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? "  -> " + detail : ""}`); }
}

async function rest(path, token, init = {}) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: ANON,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  let body = null;
  try { body = await res.json(); } catch { /* 204 등 */ }
  return { status: res.status, body };
}

// ---------------------------------------------------------------- setup
const { data: users, error: uErr } = await admin
  .from("users").select("id, email, gender").not("gender", "is", null);
if (uErr) { console.error("users 조회 실패:", uErr.message); process.exit(1); }

// 안전장치: 이 스크립트는 matches를 지우고 session_config를 덮어쓴다.
// 실제 참가자가 있는 DB에서는 절대 돌면 안 된다.
const MAX_USERS_FOR_TEST = 5;
if (users.length > MAX_USERS_FOR_TEST) {
  console.error(
    `중단: 사용자가 ${users.length}명입니다 (허용 ${MAX_USERS_FOR_TEST}명).\n` +
      "실제 참가자가 있는 DB로 보입니다. 이 스크립트는 매칭 기록을 삭제하고\n" +
      "행사 시각을 덮어쓰므로 실행하지 않습니다."
  );
  process.exit(1);
}

const male = users.find((u) => u.gender === "M");
const female = users.find((u) => u.gender === "F");
if (!male || !female) {
  console.error("남/여 테스트 계정이 각각 1명씩 필요합니다. 현재:", users);
  process.exit(1);
}

// 보드가 열려 있어야 판정이 의미 있다.
await admin.from("session_config").update({
  starts_at: new Date(Date.now() - 3600_000).toISOString(),
  ends_at: new Date(Date.now() + 2 * 3600_000).toISOString(),
  threshold_male: 1,
  threshold_female: 1,
  force_locked: false,
}).eq("id", 1);

// 깨끗한 상태에서 시작
await admin.from("matches").delete().eq("viewer_user_id", male.id);

const { data: link, error: lErr } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: male.email,
});
if (lErr) { console.error("generateLink 실패:", lErr.message); process.exit(1); }

const anonClient = createClient(URL, ANON, { auth: { persistSession: false } });
const { data: sess, error: vErr } = await anonClient.auth.verifyOtp({
  type: "magiclink",
  token_hash: link.properties.hashed_token,
});
if (vErr) { console.error("verifyOtp 실패:", vErr.message); process.exit(1); }
const TOKEN = sess.session.access_token;

const { data: femaleCard } = await admin
  .from("cards").select("id").eq("user_id", female.id).single();

console.log(`\n테스트 주체: 남학생 계정 (${male.id.slice(0, 8)}…)\n`);

// ------------------------------------------------------- 비로그인(anon)
console.log("[비로그인 방문자]");
{
  const r = await rest("session_config?select=id,starts_at", null);
  check("session_config를 읽을 수 있다 (B-3: /api/session 500 해소)",
    r.status === 200 && Array.isArray(r.body) && r.body.length === 1, `status=${r.status}`);
}
{
  const r = await rest("cards?select=instagram_id", null);
  check("cards.instagram_id 직접 조회가 막힌다", r.status === 403 || r.status === 401,
    `status=${r.status} ${JSON.stringify(r.body)}`);
}

// --------------------------------------------------- 로그인한 학생 계정
console.log("\n[로그인한 학생 — 공개 anon 키 + 본인 JWT로 DB 직접 호출]");
{
  const r = await rest("cards?select=id,one_liner,instagram_id", TOKEN);
  check("A-1 instagram_id 컬럼 조회가 거부된다 (인스타 ID 전량 유출 차단)",
    r.status === 403, `status=${r.status} ${JSON.stringify(r.body)}`);
}
{
  const r = await rest("cards?select=id,one_liner,color", TOKEN);
  const n = Array.isArray(r.body) ? r.body.length : -1;
  check("B-1 보드가 카드를 반환한다 (본인 1 + 이성 1 = 2장)",
    r.status === 200 && n === 2, `status=${r.status} 카드수=${n}`);
}
{
  const r = await rest("matches", TOKEN, {
    method: "POST",
    body: JSON.stringify({ viewer_user_id: male.id, viewed_card_id: femaleCard.id, bonus: true }),
  });
  check("A-2 matches 직접 INSERT가 거부된다 (슬롯 우회 차단)",
    r.status === 401 || r.status === 403, `status=${r.status} ${JSON.stringify(r.body)}`);
}
{
  const r = await rest(`users?id=eq.${male.id}`, TOKEN, {
    method: "PATCH", body: JSON.stringify({ banned: false, gender: "F" }),
  });
  check("A-4 users 자기수정(차단 해제·성별 변경)이 거부된다",
    r.status === 401 || r.status === 403, `status=${r.status} ${JSON.stringify(r.body)}`);
}
{
  const r = await rest(`cards?user_id=eq.${male.id}`, TOKEN, {
    method: "PATCH", body: JSON.stringify({ hidden_by_admin: false }),
  });
  check("A-5 hidden_by_admin 자기해제가 거부된다",
    r.status === 401 || r.status === 403, `status=${r.status} ${JSON.stringify(r.body)}`);
}
{
  const r = await rest(`users?id=eq.${male.id}`, TOKEN, { method: "DELETE" });
  check("A-6 users 자기삭제(슬롯 리셋)가 거부된다",
    r.status === 401 || r.status === 403, `status=${r.status} ${JSON.stringify(r.body)}`);
}

// --------------------------------------------------------- 정상 기능
console.log("\n[정상 기능이 여전히 동작하는가]");
{
  const r = await rest("rpc/gender_counts", TOKEN, { method: "POST", body: "{}" });
  const row = Array.isArray(r.body) ? r.body[0] : r.body;
  check("B-2 인원 집계가 실제 등록 수를 반환한다 (남1/여1)",
    r.status === 200 && row?.male === 1 && row?.female === 1,
    `status=${r.status} ${JSON.stringify(r.body)}`);
}
{
  const r = await rest("rpc/consume_slot_and_reveal", TOKEN, {
    method: "POST", body: JSON.stringify({ target_card_id: femaleCard.id }),
  });
  const row = Array.isArray(r.body) ? r.body[0] : r.body;
  check("슬롯 소비 → 인스타 ID가 정상 반환된다",
    r.status === 200 && typeof row?.instagram_id === "string" && row.instagram_id.length > 0,
    `status=${r.status} ${JSON.stringify(r.body)}`);
}
{
  const r = await rest("rpc/consume_slot_and_reveal", TOKEN, {
    method: "POST", body: JSON.stringify({ target_card_id: femaleCard.id }),
  });
  check("두 번째 슬롯 소비는 SLOT_ALREADY_USED로 거부된다",
    r.status >= 400 && JSON.stringify(r.body).includes("SLOT_ALREADY_USED"),
    `status=${r.status} ${JSON.stringify(r.body)}`);
}
{
  const r = await rest("rpc/my_matches", TOKEN, { method: "POST", body: "{}" });
  const row = Array.isArray(r.body) ? r.body[0] : null;
  check("내 매칭에서 인스타 ID를 다시 볼 수 있다 (bonus 필드 포함)",
    r.status === 200 && !!row?.instagram_id && row.bonus === false,
    `status=${r.status} ${JSON.stringify(r.body)}`);
}
{
  const r = await rest("cards?select=id,one_liner,color", TOKEN);
  const n = Array.isArray(r.body) ? r.body.length : -1;
  check("이미 본 카드는 보드에서 사라진다 (본인 카드 1장만 남음)",
    r.status === 200 && n === 1, `status=${r.status} 카드수=${n}`);
}

// --------------------------------------------------------------- 정리
await admin.from("matches").delete().eq("viewer_user_id", male.id);
console.log(`\n결과: ${pass} PASS / ${fail} FAIL\n`);
process.exit(fail === 0 ? 0 : 1);
