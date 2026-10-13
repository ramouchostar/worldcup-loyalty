import { NextResponse } from "next/server";
import { requestUpload } from "@/lib/missions-files";
import { respondRequest } from "@/lib/missions-files-http";
import { requireMarketplace } from "@/lib/missions-guard";

// POST /api/admin/missions/[id]/files — demande d'envoi d'une pièce jointe (brief ou retouche).
// Body : { restaurantId, scope, name, size, type }. Renvoie un lien d'envoi signé : le fichier part directement dans l'espace privé.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  const guard = await requireMarketplace(restaurantId);
  if (!guard.ok) return guard.response;
  return respondRequest(await requestUpload({ kind: "restaurant", restaurantId, userId: guard.userId }, id, body));
}
