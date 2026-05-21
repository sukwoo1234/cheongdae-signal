import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/auth";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const admin = createAdminClient();

  await admin.from("matches").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await admin.from("cards").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  const { data: allUsers } = await admin.from("users").select("id, email");
  for (const u of allUsers ?? []) {
    if (isAdminEmail(u.email)) continue;
    await admin.from("users").delete().eq("id", u.id);
    await admin.auth.admin.deleteUser(u.id).catch(() => {});
  }

  await admin.from("banned_emails").delete().neq("email", "");

  return NextResponse.json({ ok: true });
}
