import { NextResponse } from "next/server";
import { requireProvider } from "@/lib/providers";
import { refuseBrief } from "@/lib/provider-missions";

// POST /api/prestataire/missions/[id]/refuse — le prestataire refuse un brief, avec une raison.
// Body : { reason, note? }. La raison est lue par le restaurateur et comptée par la plateforme.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireProvider();
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  const r = await refuseBrief(id, guard.provider, body?.reason, body?.note);
  if (r.ok) return NextResponse.json({ ok: true });

  switch (r.reason) {
    case "reason_missing":
      return NextResponse.json({ error: "Choisis une raison : le restaurateur la lira.", reason: r.reason }, { status: 422 });
    case "not_awaiting_quote":
      return NextResponse.json({ error: "Ce brief n'attend plus de réponse.", reason: r.reason }, { status: 409 });
    case "not_found":
      return NextResponse.json({ error: "Brief introuvable.", reason: r.reason }, { status: 404 });
    default:
      return NextResponse.json({ error: "Refus impossible pour le moment. Réessaie.", reason: r.reason }, { status: 503 });
  }
}
