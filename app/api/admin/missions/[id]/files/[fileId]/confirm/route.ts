import { NextResponse } from "next/server";
import { confirmUpload } from "@/lib/missions-files";
import { respondConfirm } from "@/lib/missions-files-http";
import { requireMarketplace } from "@/lib/missions-guard";

// POST /api/admin/missions/[id]/files/[fileId]/confirm — le fichier est arrivé : on juge son contenu réel avant de l'accepter.
export async function POST(req: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const { id, fileId } = await params;
  const body = await req.json().catch(() => null);
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  const guard = await requireMarketplace(restaurantId);
  if (!guard.ok) return guard.response;
  return respondConfirm(await confirmUpload({ kind: "restaurant", restaurantId, userId: guard.userId }, id, fileId));
}
