import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { deleteUserData } from "@/lib/gdpr";
import { parseDeletionReason } from "@/lib/account-deletion";

// POST /api/me/delete — droit à l'effacement : anonymise le compte et supprime
// les données personnelles hors conservation légale (ADR 0022).
// Corps facultatif { reason, detail } : la raison ne conditionne JAMAIS la
// suppression (RGPD art. 17 — simple et sans obstacle).
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const { reason, detail } = parseDeletionReason(await request.json().catch(() => null));
  const failures = await deleteUserData(user.id);

  // Trace : la raison (migration 20260930-1000) et le résultat réel. Une
  // étape en échec passe la demande en `failed` au lieu de « completed ».
  const base = {
    user_id: user.id,
    type: "deletion",
    status: failures.length === 0 ? "completed" : "failed",
    completed_at: new Date().toISOString(),
  };
  const admin = createAdminClient();
  const { error } = await admin.from("data_requests").insert({ ...base, reason, detail, failed_steps: failures });
  if (error) {
    // Migration pas encore appliquée : on garde au moins la demande.
    console.error("[me/delete] data_requests avec raison:", error.message);
    await admin.from("data_requests").insert(base);
  }

  // Toutes les sessions, pas seulement cet appareil : l'app installée restait
  // connectée et continuait à tourner sur un profil « Compte supprimé ».
  await supabase.auth.signOut({ scope: "global" });
  return NextResponse.json({ ok: true });
}
