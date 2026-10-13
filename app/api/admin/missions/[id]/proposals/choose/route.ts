import { NextResponse } from "next/server";
import { chooseProposal } from "@/lib/missions-proposals";
import { requireMarketplace } from "@/lib/missions-guard";

// POST /api/admin/missions/[id]/proposals/choose — le restaurateur choisit une idée ; elle est ensuite verrouillée.
// Body : { restaurantId, proposalId }.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  const guard = await requireMarketplace(restaurantId);
  if (!guard.ok) return guard.response;

  const r = await chooseProposal(id, restaurantId, guard.userId, body?.proposalId);
  if (r.ok) return NextResponse.json({ ok: true, title: r.title });
  switch (r.reason) {
    case "unknown_proposal":
      return NextResponse.json({ error: "Cette idée n'existe plus : recharge la page.", reason: r.reason }, { status: 422 });
    case "too_late":
      return NextResponse.json({ error: "Il est trop tard pour choisir : le tournage est là.", reason: r.reason }, { status: 409 });
    case "not_expected":
      return NextResponse.json({ error: "Une idée est déjà choisie, ou aucune n'attend ton choix.", reason: r.reason }, { status: 409 });
    case "not_found":
      return NextResponse.json({ error: "Mission introuvable.", reason: r.reason }, { status: 404 });
    default:
      return NextResponse.json({ error: "Impossible pour le moment. Réessaie.", reason: r.reason }, { status: 503 });
  }
}
