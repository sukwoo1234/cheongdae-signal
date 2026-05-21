import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/auth";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  if (!token_hash || !type) {
    return NextResponse.redirect(new URL("/?error=invalid_link", url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });
  if (error) {
    return NextResponse.redirect(new URL(`/?error=verify_failed`, url));
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/", url));
  }

  // 어드민은 곧장 /admin으로 (온보딩·카드 건너뛰기)
  if (isAdminEmail(user.email)) {
    return NextResponse.redirect(new URL("/admin", url));
  }

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
