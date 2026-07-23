import { NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { deleteUserData } from "@/lib/gdpr";

// POST /api/me/delete — droit à l'effacement : anonymise le compte et supprime
// les données personnelles hors conservation légale (ADR 0022).
export async function POST() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  await deleteUserData(user.id);

  await createAdminClient()
    .from("data_requests")
    .insert({ user_id: user.id, type: "deletion", status: "completed", completed_at: new Date().toISOString() });

  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
