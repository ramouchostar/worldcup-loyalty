import { NextResponse } from "next/server";
import { declineQuote } from "@/lib/provider-missions";
import { requireMarketplace } from "@/lib/missions-guard";

// POST /api/admin/missions/[id]/decline — le restaurateur décline le devis reçu.
// Body : { restaurantId }. Rien n'a été payé : la mission est annulée, sans frais.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });

  const guard = await requireMarketplace(restaurantId);
  if (!guard.ok) return guard.response;

  const r = await declineQuote(id, restaurantId, guard.userId);
  if (r.ok) return NextResponse.json({ ok: true });
  if (r.reason === "not_found") return NextResponse.json({ error: "Mission introuvable." }, { status: 404 });
  if (r.reason === "not_a_quote") return NextResponse.json({ error: "Cette mission n'attend plus ta réponse." }, { status: 409 });
  return NextResponse.json({ error: "Impossible pour le moment. Réessaie." }, { status: 503 });
}
