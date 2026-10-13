import { NextResponse } from "next/server";
import { answerChange } from "@/lib/missions-changes";
import { requireMarketplace } from "@/lib/missions-guard";

// POST /api/admin/missions/[id]/changes/[changeId]/answer — le restaurateur répond au supplément (ou retire sa demande).
// Body : { restaurantId, answer: "accept" | "decline" | "withdraw" }. Refuser ou se taire : le brief d'origine tient.
export async function POST(req: Request, { params }: { params: Promise<{ id: string; changeId: string }> }) {
  const { id, changeId } = await params;
  const body = await req.json().catch(() => null);
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  const guard = await requireMarketplace(restaurantId);
  if (!guard.ok) return guard.response;

  const r = await answerChange(id, restaurantId, guard.userId, changeId, body?.answer);
  if (r.ok) return NextResponse.json({ ok: true });
  switch (r.reason) {
    case "too_late":
      return NextResponse.json({ error: "Il est trop tard : le tournage est dans moins de 7 jours, le brief d'origine tient.", reason: r.reason }, { status: 409 });
    case "not_expected":
      return NextResponse.json({ error: "Cette demande n'attend pas ta réponse.", reason: r.reason }, { status: 409 });
    case "not_found":
      return NextResponse.json({ error: "Demande introuvable.", reason: r.reason }, { status: 404 });
    default:
      return NextResponse.json({ error: "Impossible pour le moment. Réessaie.", reason: r.reason }, { status: 503 });
  }
}
