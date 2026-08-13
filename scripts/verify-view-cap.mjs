/**
 * 카드당 열람 상한(max_views_per_card) 검증.
 *
 * 임시 남학생 3명을 만들어 같은 여학생 카드를 동시에 열게 한다.
 * 상한이 2일 때 정확히 2명만 통과해야 한다 (동시 요청 포함).
 *
 * 실행: node --env-file=.env.local scripts/verify-view-cap.mjs
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const CAP = 2;
const PROBES = ["cap-probe-1@cju.ac.kr", "cap-probe-2@cju.ac.kr", "cap-probe-3@cju.ac.kr"];
const created = [];

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? "  -> " + detail : ""}`); }
};

async function tokenFor(email) {
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data } = await c.auth.verifyOtp({
    type: "magiclink",
    token_hash: link.properties.hashed_token,
  });
  return data.session.access_token;
}

const rest = async (path, token, init = {}) => {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: ANON, Authorization: `Bearer ${token}`,
      "Content-Type": "application/json", ...(init.headers ?? {}),
    },
  });
  let body = null;
  try { body = await res.json(); } catch {}
  return { status: res.status, body };
};

try {
  const { data: users } = await admin.from("users").select("id, gender").not("gender", "is", null);
  if (users.length > 5) {
    console.error(`중단: 사용자 ${users.length}명. 실제 참가자가 있는 DB로 보인다.`);
    process.exit(1);
  }
  const female = users.find((u) => u.gender === "F");
  if (!female) { console.error("여학생 테스트 계정이 필요합니다."); process.exit(1); }
  const { data: fCard } = await admin.from("cards").select("id").eq("user_id", female.id).single();

  await admin.from("session_config").update({
    starts_at: new Date(Date.now() - 3600e3).toISOString(),
    ends_at:   new Date(Date.now() + 3600e3).toISOString(),
    threshold_male: 1, threshold_female: 1,
    force_locked: false, max_views_per_card: CAP,
  }).eq("id", 1);
  await admin.from("matches").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  for (const email of PROBES) {
    const { data } = await admin.auth.admin.createUser({ email, email_confirm: true });
    created.push(data.user.id);
    await admin.from("users").insert({
      id: data.user.id, email, gender: "M",
      terms_accepted_at: new Date().toISOString(),
      privacy_accepted_at: new Date().toISOString(),
    });
    await admin.from("cards").insert({
      user_id: data.user.id, one_liner: "상한검증", instagram_id: "cap_probe", color: "green",
    });
  }
  const tokens = await Promise.all(PROBES.map(tokenFor));
  console.log(`남학생 3명이 같은 카드를 동시에 연다 (상한 ${CAP})\n`);

  // 동시 발사 — 잠금이 없으면 셋 다 통과한다
  const results = await Promise.all(
    tokens.map((t) => rest("rpc/consume_slot_and_reveal", t, {
      method: "POST", body: JSON.stringify({ target_card_id: fCard.id }),
    }))
  );

  const ok = results.filter((r) => r.status === 200).length;
  const full = results.filter((r) => JSON.stringify(r.body).includes("CARD_FULL")).length;
  console.log(`  성공 ${ok}건 / CARD_FULL 거부 ${full}건\n`);

  check(`동시 요청에도 정확히 ${CAP}명만 통과한다`, ok === CAP, `실제 ${ok}명`);
  check("초과분은 CARD_FULL로 거부된다", full === 3 - CAP, `실제 ${full}건`);

  const { count } = await admin.from("matches")
    .select("id", { count: "exact", head: true }).eq("viewed_card_id", fCard.id);
  check(`DB의 실제 열람 수가 ${CAP}을 넘지 않는다`, count === CAP, `실제 ${count}회`);

  // 상한에 걸린 카드는 보드에서도 사라져야 한다
  const idx = results.findIndex((r) => r.status !== 200);
  if (idx >= 0) {
    const board = await rest("cards?select=id", tokens[idx]);
    const visible = board.body.some((c) => c.id === fCard.id);
    check("마감된 카드는 보드에서 사라진다", !visible, visible ? "아직 보임" : "");
  }

  // 무제한(null)으로 되돌리면 다시 열려야 한다
  await admin.from("session_config").update({ max_views_per_card: null }).eq("id", 1);
  if (idx >= 0) {
    const board = await rest("cards?select=id", tokens[idx]);
    check("상한을 비우면(null) 다시 열람 가능해진다",
      board.body.some((c) => c.id === fCard.id));
  }

} finally {
  for (const id of created) {
    await admin.from("users").delete().eq("id", id);
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  await admin.from("matches").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await admin.from("session_config")
    .update({ force_locked: true, max_views_per_card: null }).eq("id", 1);

  const { count: u } = await admin.from("users").select("id", { count: "exact", head: true });
  const { count: c } = await admin.from("cards").select("id", { count: "exact", head: true });
  console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
  console.log(`정리 완료 — 사용자 ${u} / 카드 ${c} · 보드 잠금 · 상한 해제`);
  process.exit(fail === 0 ? 0 : 1);
}
