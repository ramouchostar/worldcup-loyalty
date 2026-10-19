import { NextResponse } from "next/server";
import { requestCorrections } from "@/lib/missions-bat";
import { requireMarketplace } from "@/lib/missions-guard";

// POST /api/admin/missions/[id]/bat/corrections — des corrections sur l'épreuve : TOUTES en un seul envoi, chacune classée et motivée.
// Body : { restaurantId, notes: [{ category, text }] }. Deux tours au plus ; la 3e épreuve se signe.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  const guard = await requireMarketplace(restaurantId);
  if (!guard.ok) return guard.response;

  const r = await requestCorrections(id, restaurantId, guard.userId, body);
  if (r.ok) return NextResponse.json({ ok: true, left: r.left });
  switch (r.reason) {
    case "invalid":
      return NextResponse.json({ error: r.empty ? "Ajoute au moins une correction." : "Certaines corrections ne sont pas assez précises.", reason: r.reason, problems: r.problems }, { status: 422 });
    case "no_rounds_left":
      return NextResponse.json({ error: "Tu as utilisé tes deux tours de corrections : signe l'épreuve, ou écris à Boosteats.", reason: r.reason }, { status: 409 });
    case "not_awaiting_review":
    case "not_production":
      return NextResponse.json({ error: "Aucune épreuve n'attend ta réponse.", reason: r.reason }, { status: 409 });
    case "not_print":
      return NextResponse.json({ error: "Cette mission n'est pas une impression.", reason: r.reason }, { status: 409 });
    case "not_found":
      return NextResponse.json({ error: "Mission introuvable.", reason: r.reason }, { status: 404 });
    default:
      return NextResponse.json({ error: "Impossible pour le moment. Réessaie.", reason: r.reason }, { status: 503 });
  }
}
