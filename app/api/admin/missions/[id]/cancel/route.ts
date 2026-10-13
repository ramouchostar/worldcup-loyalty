import { NextResponse } from "next/server";
import { cancelByRestaurant } from "@/lib/missions-cancel";
import { requireMarketplace } from "@/lib/missions-guard";

// POST /api/admin/missions/[id]/cancel — le restaurateur annule. Body : { restaurantId, reason, note? }.
// Le coût est celui du MOMENT du clic (barème des 7 jours et 48 h), jamais celui affiché plus tôt.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  const guard = await requireMarketplace(restaurantId);
  if (!guard.ok) return guard.response;

  const r = await cancelByRestaurant(id, restaurantId, guard.userId, body);
  if (r.ok) return NextResponse.json({ ok: true, band: r.band });
  switch (r.reason) {
    case "invalid":
      return NextResponse.json({ error: "Choisis une raison pour annuler.", reason: r.reason, issue: r.issue }, { status: 422 });
    case "already_cancelled":
      return NextResponse.json({ error: "Cette mission est déjà annulée.", reason: r.reason }, { status: 409 });
    case "not_cancellable":
      return NextResponse.json({ error: "Cette mission ne peut plus s'annuler d'ici : écris à Boosteats.", reason: r.reason }, { status: 409 });
    case "not_found":
      return NextResponse.json({ error: "Mission introuvable.", reason: r.reason }, { status: 404 });
    default:
      return NextResponse.json({ error: "Impossible pour le moment. Réessaie.", reason: r.reason }, { status: 503 });
  }
}
