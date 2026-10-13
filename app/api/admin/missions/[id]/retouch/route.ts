import { NextResponse } from "next/server";
import { requestRetouch } from "@/lib/missions-dayof";
import { requireMarketplace } from "@/lib/missions-guard";

// POST /api/admin/missions/[id]/retouch — un tour de retours : TOUTES les remarques en un seul envoi.
// Body : { restaurantId, notes: [{ category, text, at? }] }. Deux tours au plus ; chaque remarque est classée et motivée.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  const guard = await requireMarketplace(restaurantId);
  if (!guard.ok) return guard.response;

  const r = await requestRetouch(id, restaurantId, guard.userId, body);
  if (r.ok) return NextResponse.json({ ok: true, round: r.round, left: r.left });
  switch (r.reason) {
    case "invalid":
      return NextResponse.json({ error: r.empty ? "Ajoute au moins une remarque." : "Certaines remarques ne sont pas assez précises.", reason: r.reason, problems: r.problems }, { status: 422 });
    case "no_rounds_left":
      return NextResponse.json({ error: "Tu as utilisé tes deux tours de retours. Tu peux valider la livraison, ou écrire à Boosteats.", reason: r.reason }, { status: 409 });
    case "not_delivered":
      return NextResponse.json({ error: "Cette mission n'attend pas de retouche.", reason: r.reason }, { status: 409 });
    case "not_found":
      return NextResponse.json({ error: "Mission introuvable.", reason: r.reason }, { status: 404 });
    default:
      return NextResponse.json({ error: "Impossible pour le moment. Réessaie.", reason: r.reason }, { status: 503 });
  }
}
