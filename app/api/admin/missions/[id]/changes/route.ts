import { NextResponse } from "next/server";
import { requestChange } from "@/lib/missions-changes";
import { requireMarketplace } from "@/lib/missions-guard";
import { REQUEST_ISSUE_TEXT, REQUEST_VERDICT_TEXT } from "@/lib/mission-changes";

// POST /api/admin/missions/[id]/changes — une demande de modification du brief verrouillé.
// Body : { restaurantId, categories: [...], description, attachmentIds?: [...] }. Une seule ouverte à la fois, deux au total, jusqu'à J-7.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  const guard = await requireMarketplace(restaurantId);
  if (!guard.ok) return guard.response;

  const r = await requestChange(id, restaurantId, guard.userId, body);
  if (r.ok) return NextResponse.json({ ok: true, seq: r.seq });
  switch (r.reason) {
    case "invalid":
      return NextResponse.json({ error: REQUEST_ISSUE_TEXT[r.issues[0].code], reason: r.reason, issues: r.issues }, { status: 422 });
    case "refused":
      return NextResponse.json({ error: REQUEST_VERDICT_TEXT[r.verdict], reason: r.verdict }, { status: 409 });
    case "not_found":
      return NextResponse.json({ error: "Mission introuvable.", reason: r.reason }, { status: 404 });
    default:
      return NextResponse.json({ error: "Impossible pour le moment. Réessaie.", reason: r.reason }, { status: 503 });
  }
}
