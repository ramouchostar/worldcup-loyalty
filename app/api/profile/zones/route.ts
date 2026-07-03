import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";
import { sanitizeZones } from "@/lib/zones";

// PUT /api/profile/zones — le membre met à jour ses zones (ADR 0018).
// Body : { zones: string[] } (1 à 3). RLS : ligne profiles propre uniquement.
export async function PUT(req: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const zones = sanitizeZones(body?.zones);
  if (zones.length === 0) {
    return NextResponse.json(
      { error: "Indique au moins une zone (2 à 40 caractères)." },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("profiles").update({ zones }).eq("id", user.id);
  if (error) return NextResponse.json({ error: "Erreur lors de l'enregistrement." }, { status: 500 });

  return NextResponse.json({ ok: true, zones });
}
