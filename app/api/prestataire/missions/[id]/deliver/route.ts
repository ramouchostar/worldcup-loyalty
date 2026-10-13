import { NextResponse } from "next/server";
import { requireProvider } from "@/lib/providers";
import { submitDelivery } from "@/lib/missions-dayof";

// POST /api/prestataire/missions/[id]/deliver — la livraison : des liens https de téléchargement.
// Body : { links: ["https://…"], message? }. Il faut d'abord un compte-rendu.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireProvider();
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  const r = await submitDelivery(id, guard.provider, body);
  if (r.ok) return NextResponse.json({ ok: true });
  switch (r.reason) {
    case "invalid":
      return NextResponse.json({ error: "Ta livraison n'est pas valable.", reason: r.reason, issues: r.issues }, { status: 422 });
    case "no_report":
      return NextResponse.json({ error: "Remplis d'abord le compte-rendu du tournage : c'est la pièce de référence.", reason: r.reason }, { status: 409 });
    case "not_in_production":
      return NextResponse.json({ error: "Cette mission n'attend pas de livraison.", reason: r.reason }, { status: 409 });
    case "not_found":
      return NextResponse.json({ error: "Mission introuvable.", reason: r.reason }, { status: 404 });
    default:
      return NextResponse.json({ error: "Impossible pour le moment. Réessaie.", reason: r.reason }, { status: 503 });
  }
}
