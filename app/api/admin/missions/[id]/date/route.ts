import { NextResponse } from "next/server";
import { chooseShootDate } from "@/lib/missions-dates";
import { requireMarketplace } from "@/lib/missions-guard";
import { shootChoiceMessage } from "@/lib/mission-dates";

// POST /api/admin/missions/[id]/date — le restaurateur choisit sa date de tournage.
// Body : { restaurantId, shoot_date, shoot_slot, roles[], contact{name,phone}, access? }.
// Un refus dit pourquoi : jour bloqué ou déjà pris, trop tôt, champs manquants.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });

  const guard = await requireMarketplace(restaurantId);
  if (!guard.ok) return guard.response;

  const r = await chooseShootDate(id, restaurantId, guard.userId, body);
  if (r.ok) return NextResponse.json({ ok: true, date: r.date });

  switch (r.reason) {
    case "invalid_choice":
      return NextResponse.json({ error: r.issue ? shootChoiceMessage(r.issue) : "Cette date n'est pas possible.", reason: r.reason, issue: r.issue }, { status: r.issue === "booked" ? 409 : 422 });
    case "invalid_answers":
      return NextResponse.json({ error: "Il manque des réponses.", reason: r.reason, issues: r.issues }, { status: 422 });
    case "not_accepted":
      return NextResponse.json({ error: "Cette mission n'attend pas de date : le devis doit d'abord être accepté.", reason: r.reason }, { status: 409 });
    case "not_found":
      return NextResponse.json({ error: "Mission introuvable.", reason: r.reason }, { status: 404 });
    default:
      return NextResponse.json({ error: "Impossible pour le moment. Réessaie.", reason: r.reason }, { status: 503 });
  }
}
