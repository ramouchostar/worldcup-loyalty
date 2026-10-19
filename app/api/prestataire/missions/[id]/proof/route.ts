import { NextResponse } from "next/server";
import { requireProvider } from "@/lib/providers";
import { submitProof } from "@/lib/missions-bat";
import { DELIVERY_ISSUE_TEXT } from "@/lib/mission-dayof";

// POST /api/prestataire/missions/[id]/proof — l'imprimeur envoie une épreuve (bon à tirer) : des liens https et un mot.
// Body : { links: ["https://…"], message? }. Une à la fois ; trois au plus (l'originale + deux corrections) ; jamais après la signature.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireProvider();
  if (!guard.ok) return guard.response;
  const body = await req.json().catch(() => null);

  const r = await submitProof(id, guard.provider, body);
  if (r.ok) return NextResponse.json({ ok: true, round: r.round });
  switch (r.reason) {
    case "invalid":
      return NextResponse.json({ error: DELIVERY_ISSUE_TEXT[r.issues[0].code], reason: r.reason, issues: r.issues }, { status: 422 });
    case "already_signed":
      return NextResponse.json({ error: "Le bon à tirer est déjà signé : tu peux imprimer.", reason: r.reason }, { status: 409 });
    case "awaiting_review":
      return NextResponse.json({ error: "Une épreuve attend déjà la réponse du restaurateur.", reason: r.reason }, { status: 409 });
    case "no_rounds_left":
      return NextResponse.json({ error: "Trois épreuves au plus. Écris à Boosteats si le désaccord persiste.", reason: r.reason }, { status: 409 });
    case "not_production":
      return NextResponse.json({ error: "Touche d'abord « Je commence ».", reason: r.reason }, { status: 409 });
    case "not_print":
      return NextResponse.json({ error: "Cette mission n'est pas une impression.", reason: r.reason }, { status: 409 });
    case "not_found":
      return NextResponse.json({ error: "Mission introuvable.", reason: r.reason }, { status: 404 });
    default:
      return NextResponse.json({ error: "Impossible pour le moment. Réessaie.", reason: r.reason }, { status: 503 });
  }
}
