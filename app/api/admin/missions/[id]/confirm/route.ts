import { NextResponse } from "next/server";
import { confirmPresence } from "@/lib/missions-presence";
import { requireMarketplace } from "@/lib/missions-guard";

// POST /api/admin/missions/[id]/confirm — « je serai là » côté restaurateur (de J-2 au jour J). Idempotent.
// Body : { restaurantId }.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  const guard = await requireMarketplace(restaurantId);
  if (!guard.ok) return guard.response;

  const r = await confirmPresence(id, "restaurant", { restaurantId }, guard.userId);
  return respond(r);
}

function respond(r: Awaited<ReturnType<typeof confirmPresence>>) {
  if (r.ok) return NextResponse.json({ ok: true, already: r.already });
  switch (r.reason) {
    case "too_early":
      return NextResponse.json({ error: "Tu pourras confirmer à partir de deux jours avant le tournage.", reason: r.reason }, { status: 409 });
    case "too_late":
      return NextResponse.json({ error: "Le tournage est passé.", reason: r.reason }, { status: 409 });
    case "not_booked":
      return NextResponse.json({ error: "Cette mission n'a pas de date réservée.", reason: r.reason }, { status: 409 });
    case "not_found":
      return NextResponse.json({ error: "Mission introuvable.", reason: r.reason }, { status: 404 });
    default:
      return NextResponse.json({ error: "Impossible pour le moment. Réessaie.", reason: r.reason }, { status: 503 });
  }
}
