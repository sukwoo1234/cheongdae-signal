"use client";
import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";

export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookieOptions: SUPABASE_COOKIE_OPTIONS }
  );
