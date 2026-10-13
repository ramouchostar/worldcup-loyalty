import { NextResponse } from "next/server";
import { cancelByProvider } from "@/lib/missions-cancel";
import { requireProvider } from "@/lib/providers";

// POST /api/prestataire/missions/[id]/cancel — le prestataire ne peut plus venir. Body : { reason, note? }.
// Le restaurateur est toujours remboursé en entier ; une annulation tardive est sanctionnée (avertissement,
// puis visibilité réduite, puis exclusion).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireProvider();
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  const r = await cancelByProvider(id, guard.provider, body);
  if (r.ok) return NextResponse.json({ ok: true, band: r.band, sanction: r.sanction });
  switch (r.reason) {
    case "invalid":
      return NextResponse.json({ error: "Choisis une raison pour annuler.", reason: r.reason, issue: r.issue }, { status: 422 });
    case "already_cancelled":
      return NextResponse.json({ error: "Cette mission est déjà annulée.", reason: r.reason }, { status: 409 });
    case "not_cancellable":
      return NextResponse.json({ error: "Cette mission ne peut plus s'annuler d'ici : appelle Boosteats.", reason: r.reason }, { status: 409 });
    case "not_found":
      return NextResponse.json({ error: "Mission introuvable.", reason: r.reason }, { status: 404 });
    default:
      return NextResponse.json({ error: "Impossible pour le moment. Réessaie.", reason: r.reason }, { status: 503 });
  }
}
