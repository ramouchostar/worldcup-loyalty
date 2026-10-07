import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { resolvePostLoginDestination } from "@/lib/post-login";
import { VIEW_MODE_COOKIE, VIEW_MODE_MAX_AGE } from "@/lib/view-mode";

// « Voir l'app comme un client » : pose le cookie de mode, puis renvoie vers
// l'espace membre (ou /join si le compte n'a encore rejoint aucun restaurant).
// POST seulement : un simple lien ne doit pas changer l'état.
export async function POST(req: Request) {
  const origin = new URL(req.url).origin;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const dest = user ? await resolvePostLoginDestination(user.id, { clientMode: true }) : "/login";
  const res = NextResponse.redirect(`${origin}${dest}`, { status: 303 });
  res.cookies.set(VIEW_MODE_COOKIE, "client", {
    httpOnly: true,
    maxAge: VIEW_MODE_MAX_AGE,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return res;
}
