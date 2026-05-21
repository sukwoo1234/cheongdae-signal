import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/", url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/?error=auth_failed", url));
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await supabase
      .from("users")
      .upsert({ id: user.id, email: user.email! }, { onConflict: "id" });

    const { data: prof } = await supabase
      .from("users")
      .select("gender, banned")
      .eq("id", user.id)
      .single();

    if (prof?.banned) {
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL("/?error=banned", url));
    }
    if (!prof?.gender) {
      return NextResponse.redirect(new URL("/onboarding", url));
    }

    const { count } = await supabase
      .from("cards")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);
    if (!count) {
      return NextResponse.redirect(new URL("/card/new", url));
    }

    return NextResponse.redirect(new URL("/board", url));
  }

  return NextResponse.redirect(new URL("/", url));
}
