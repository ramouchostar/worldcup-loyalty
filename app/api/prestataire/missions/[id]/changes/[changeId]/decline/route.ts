import { NextResponse } from "next/server";
import { requireProvider } from "@/lib/providers";
import { declineChange } from "@/lib/missions-changes";

// POST /api/prestataire/missions/[id]/changes/[changeId]/decline — refuser une demande de modification, avec sa raison.
// Body : { reason }. Le brief d'origine tient ; la demande ne compte pas dans les deux du restaurateur.
export async function POST(req: Request, { params }: { params: Promise<{ id: string; changeId: string }> }) {
  const { id, changeId } = await params;
  const guard = await requireProvider();
  if (!guard.ok) return guard.response;
  const body = await req.json().catch(() => null);

  const r = await declineChange(id, guard.provider, changeId, body);
  if (r.ok) return NextResponse.json({ ok: true });
  switch (r.reason) {
    case "reason_short":
      return NextResponse.json({ error: "Dis pourquoi (12 caractères au moins) : le restaurateur lira ta raison.", reason: r.reason }, { status: 422 });
    case "reason_long":
      return NextResponse.json({ error: "Ta raison est trop longue (500 caractères au plus).", reason: r.reason }, { status: 422 });
    case "not_expected":
      return NextResponse.json({ error: "Cette demande n'attend pas ta réponse.", reason: r.reason }, { status: 409 });
    case "not_found":
      return NextResponse.json({ error: "Demande introuvable.", reason: r.reason }, { status: 404 });
    default:
      return NextResponse.json({ error: "Impossible pour le moment. Réessaie.", reason: r.reason }, { status: 503 });
  }
}
