import { NextResponse } from "next/server";
import { requireProvider } from "@/lib/providers";
import { quoteChange } from "@/lib/missions-changes";
import { QUOTE_ISSUE_TEXT } from "@/lib/mission-changes";

// POST /api/prestataire/missions/[id]/changes/[changeId]/quote — chiffrer une demande de modification.
// Body : { free: boolean, priceCents?, deltaDays, note? }. « free » = sans supplément.
export async function POST(req: Request, { params }: { params: Promise<{ id: string; changeId: string }> }) {
  const { id, changeId } = await params;
  const guard = await requireProvider();
  if (!guard.ok) return guard.response;
  const body = await req.json().catch(() => null);

  const r = await quoteChange(id, guard.provider, changeId, body);
  if (r.ok) return NextResponse.json({ ok: true });
  switch (r.reason) {
    case "invalid":
      return NextResponse.json({ error: QUOTE_ISSUE_TEXT[r.issues[0].code], reason: r.reason, issues: r.issues }, { status: 422 });
    case "not_expected":
      return NextResponse.json({ error: "Cette demande n'attend pas ta réponse.", reason: r.reason }, { status: 409 });
    case "not_found":
      return NextResponse.json({ error: "Demande introuvable.", reason: r.reason }, { status: 404 });
    default:
      return NextResponse.json({ error: "Impossible pour le moment. Réessaie.", reason: r.reason }, { status: 503 });
  }
}
