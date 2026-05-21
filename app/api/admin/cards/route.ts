import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/auth";

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const q = new URL(req.url).searchParams.get("q") ?? "";
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("cards")
    .select("id, one_liner, color, hidden_by_user, hidden_by_admin, users!inner(email, gender)")
    .ilike("one_liner", `%${q}%`)
    .limit(50);
  if (error) return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });

  const flat = (data ?? []).map((c: { id: string; one_liner: string; color: string; hidden_by_admin: boolean; users: { email: string; gender: string } }) => ({
    id: c.id,
    one_liner: c.one_liner,
    color: c.color,
    hidden_by_admin: c.hidden_by_admin,
    email: c.users.email,
    gender: c.users.gender,
  }));
  return NextResponse.json({ cards: flat });
}
