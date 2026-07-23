import { NextResponse } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { exportUserData } from "@/lib/gdpr";

// GET /api/me/export — portabilité : télécharge toutes les données du membre.
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const payload = await exportUserData(user.id);

  // Traçabilité de la demande (ADR 0022)
  await createAdminClient()
    .from("data_requests")
    .insert({ user_id: user.id, type: "export", status: "completed", completed_at: new Date().toISOString() });

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="mes-donnees.json"',
    },
  });
}
