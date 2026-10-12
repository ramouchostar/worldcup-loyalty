import { NextResponse } from "next/server";
import { requireProvider } from "@/lib/providers";
import { submitQuote } from "@/lib/provider-missions";

// POST /api/prestataire/missions/[id]/quote — le prestataire chiffre un brief reçu.
// Body : { priceCents, hours, deliveryDays, included[], hypotheses }. Devis ferme pour ce brief.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireProvider();
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  const r = await submitQuote(id, guard.provider, body);
  if (r.ok) return NextResponse.json({ ok: true });

  switch (r.reason) {
    case "invalid_quote":
      return NextResponse.json({ error: "Il manque des informations dans ton devis.", reason: r.reason, issues: r.issues }, { status: 422 });
    case "not_awaiting_quote":
      return NextResponse.json({ error: "Ce brief n'attend plus de devis.", reason: r.reason }, { status: 409 });
    case "not_found":
      return NextResponse.json({ error: "Brief introuvable.", reason: r.reason }, { status: 404 });
    default:
      return NextResponse.json({ error: "Envoi impossible pour le moment. Réessaie.", reason: r.reason }, { status: 503 });
  }
}
