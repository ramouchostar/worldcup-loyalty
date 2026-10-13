import { NextResponse } from "next/server";
import { rejectProposals } from "@/lib/missions-proposals";
import { requireMarketplace } from "@/lib/missions-guard";

// POST /api/admin/missions/[id]/proposals/reject — « Aucune ne me plaît » : UNE nouvelle série, avec une raison par idée.
// Body : { restaurantId, reasons: { [proposalId]: "pourquoi" } }.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  const guard = await requireMarketplace(restaurantId);
  if (!guard.ok) return guard.response;

  const r = await rejectProposals(id, restaurantId, guard.userId, body);
  if (r.ok) return NextResponse.json({ ok: true });
  switch (r.reason) {
    case "invalid":
      return NextResponse.json({ error: "Dis pourquoi pour chaque idée.", reason: r.reason, issues: r.issues }, { status: 422 });
    case "too_late":
      return NextResponse.json({ error: "Il est trop tard pour une nouvelle série : choisis parmi les idées reçues.", reason: r.reason }, { status: 409 });
    case "not_expected":
      return NextResponse.json({ error: "Tu ne peux pas demander de nouvelle série : une seule est possible, et pas après un choix.", reason: r.reason }, { status: 409 });
    case "not_found":
      return NextResponse.json({ error: "Mission introuvable.", reason: r.reason }, { status: 404 });
    default:
      return NextResponse.json({ error: "Impossible pour le moment. Réessaie.", reason: r.reason }, { status: 503 });
  }
}
