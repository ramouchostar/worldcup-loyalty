import { NextResponse } from "next/server";
import { confirmPresence } from "@/lib/missions-presence";
import { requireProvider } from "@/lib/providers";

// POST /api/prestataire/missions/[id]/confirm — « je serai là » côté prestataire (de J-2 au jour J). Idempotent.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireProvider();
  if (!guard.ok) return guard.response;

  const r = await confirmPresence(id, "provider", { providerId: guard.provider.id }, guard.userId);
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
