import { NextResponse } from "next/server";
import { signBat } from "@/lib/missions-bat";
import { requireMarketplace } from "@/lib/missions-guard";
import { SIGN_ISSUE_TEXT } from "@/lib/mission-print";

// POST /api/admin/missions/[id]/bat/sign — signer le bon à tirer : tous les points cochés, un nom. Définitif : l'impression part.
// Body : { restaurantId, checks: { texts, visual, qr?, spec }, name }.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  const guard = await requireMarketplace(restaurantId);
  if (!guard.ok) return guard.response;

  const r = await signBat(id, restaurantId, guard.userId, body);
  if (r.ok) return NextResponse.json({ ok: true });
  switch (r.reason) {
    case "invalid":
      return NextResponse.json({ error: SIGN_ISSUE_TEXT[r.issues[0].code], reason: r.reason, issues: r.issues }, { status: 422 });
    case "not_awaiting_review":
    case "not_production":
      return NextResponse.json({ error: "Aucune épreuve n'attend ta signature (elle est peut-être déjà signée).", reason: r.reason }, { status: 409 });
    case "not_print":
      return NextResponse.json({ error: "Cette mission n'est pas une impression.", reason: r.reason }, { status: 409 });
    case "not_found":
      return NextResponse.json({ error: "Mission introuvable.", reason: r.reason }, { status: 404 });
    default:
      return NextResponse.json({ error: "Impossible pour le moment. Réessaie.", reason: r.reason }, { status: 503 });
  }
}
