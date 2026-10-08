import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { requestService, SERVICE_KINDS, type ServiceKind } from "@/lib/service-requests";

// ADR 0081 §6 — une mission « pub dans ta zone » ou « vidéos » : le
// restaurateur demande, l'équipe voit la demande sur /platform et rappelle.
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) ?? {};
  const restaurantId = typeof body.restaurantId === "string" ? body.restaurantId : null;
  const service = SERVICE_KINDS.includes(body.service) ? (body.service as ServiceKind) : null;
  // Surface du clic, texte court connu : tout le reste est neutralisé.
  const source = body.source === "accueil_etape1" || body.source === "accueil_etape2" ? (body.source as string) : null;

  if (!restaurantId || !service) {
    return NextResponse.json({ error: "restaurantId et service requis." }, { status: 400 });
  }

  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  const result = await requestService(restaurantId, service, source, guard.userId);
  if (result === "error") {
    return NextResponse.json({ error: "Demande impossible pour le moment. Réessaie plus tard." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, alreadyPending: result === "already_pending" });
}
