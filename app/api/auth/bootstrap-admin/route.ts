import { NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";

// POST (et non GET) : cet endpoint MUTE l'état (is_admin=true). Un GET mutant
// est déclenchable par CSRF (<img src=...>) — on exige donc POST. Reste borné
// à ADMIN_EMAILS. À terme, supprimable une fois le bootstrap effectué.
export async function POST() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (!adminEmails.includes((user.email ?? "").toLowerCase())) {
    return NextResponse.json({ error: "Email non autorisé" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ is_admin: true })
    .eq("id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.redirect(new URL("/admin", process.env.NEXT_PUBLIC_APP_URL ?? "https://worldcup-loyalty.vercel.app"));
}
