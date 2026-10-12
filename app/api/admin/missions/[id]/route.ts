import { NextResponse } from "next/server";
import { saveDraft } from "@/lib/missions";
import { requireMarketplace } from "@/lib/missions-guard";

// PATCH /api/admin/missions/[id] — sauvegarde automatique du brouillon.
// Body : { restaurantId, answers }. Seules les questions du modèle sont enregistrées.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });

  const guard = await requireMarketplace(restaurantId);
  if (!guard.ok) return guard.response;

  const r = await saveDraft(id, restaurantId, body?.answers);
  if (r.ok) return NextResponse.json({ ok: true });
  if (r.reason === "not_found") return NextResponse.json({ error: "Brief introuvable." }, { status: 404 });
  if (r.reason === "not_a_draft") return NextResponse.json({ error: "Ce brief est déjà envoyé : il ne se modifie plus." }, { status: 409 });
  return NextResponse.json({ error: "Sauvegarde impossible pour le moment." }, { status: 503 });
}
