import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/auth";

export async function GET(req: Request) {
  const { user } = await getAdminContext();
  if (!user) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const q = new URL(req.url).searchParams.get("q") ?? "";
  if (q.length > 100) {
    return NextResponse.json({ error: "QUERY_TOO_LONG" }, { status: 400 });
  }
  const admin = createAdminClient();
  // service_role은 column revoke 우회 → instagram_id 포함 가능
  const { data, error } = await admin
    .from("cards")
    .select("id, one_liner, instagram_id, color, hidden_by_user, hidden_by_admin, users!inner(email, gender)")
    .ilike("one_liner", `%${q}%`)
    .limit(50);
  if (error) return NextResponse.json({ error: "DB_ERROR" }, { status: 500 });

  type CardJoinRow = {
    id: string;
    one_liner: string;
    instagram_id: string;
    color: string;
    hidden_by_admin: boolean;
    users: { email: string; gender: string };
  };

  const flat = ((data ?? []) as unknown as CardJoinRow[]).map((c) => ({
    id: c.id,
    one_liner: c.one_liner,
    instagram_id: c.instagram_id,
    color: c.color,
    hidden_by_admin: c.hidden_by_admin,
    email: c.users.email,
    gender: c.users.gender,
  }));
  return NextResponse.json({ cards: flat });
}
