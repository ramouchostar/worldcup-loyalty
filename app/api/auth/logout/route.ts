import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { VIEW_MODE_COOKIE } from "@/lib/view-mode";

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  const origin = new URL(req.url).origin;
  const res = NextResponse.redirect(`${origin}/login`, { status: 302 });
  // Le prochain compte sur cet appareil repart du routage normal.
  res.cookies.delete(VIEW_MODE_COOKIE);
  return res;
}
