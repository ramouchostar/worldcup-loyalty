import { NextResponse } from "next/server";
import { respondToReport } from "@/lib/missions-dayof";
import { requireMarketplace } from "@/lib/missions-guard";

// POST /api/admin/missions/[id]/report-response — le restaurateur confirme ou conteste le compte-rendu.
// Body : { restaurantId, contest: boolean, note? } — contester demande une vraie raison.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  const guard = await requireMarketplace(restaurantId);
  if (!guard.ok) return guard.response;

  const r = await respondToReport(id, restaurantId, guard.userId, body);
  if (r.ok) return NextResponse.json({ ok: true, contested: r.contested });
  switch (r.reason) {
    case "invalid_contest":
      return NextResponse.json({ error: "Explique en quelques mots ce qui n'est pas exact (au moins 12 caractères).", reason: r.reason }, { status: 422 });
    case "already_answered":
      return NextResponse.json({ error: "Tu as déjà répondu à ce compte-rendu.", reason: r.reason }, { status: 409 });
    case "no_report":
      return NextResponse.json({ error: "Le prestataire n'a pas encore rempli son compte-rendu.", reason: r.reason }, { status: 409 });
    case "not_found":
      return NextResponse.json({ error: "Mission introuvable.", reason: r.reason }, { status: 404 });
    default:
      return NextResponse.json({ error: "Impossible pour le moment. Réessaie.", reason: r.reason }, { status: 503 });
  }
}
