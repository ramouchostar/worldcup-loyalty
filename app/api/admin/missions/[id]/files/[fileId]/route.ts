import { NextResponse } from "next/server";
import { downloadUrl, removeFile } from "@/lib/missions-files";
import { respondDownload, respondRemove } from "@/lib/missions-files-http";
import { requireMarketplace } from "@/lib/missions-guard";

// GET /api/admin/missions/[id]/files/[fileId]?restaurantId=… — télécharger (lien signé de 60 s, téléchargement forcé).
export async function GET(req: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const { id, fileId } = await params;
  const restaurantId = new URL(req.url).searchParams.get("restaurantId") ?? "";
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  const guard = await requireMarketplace(restaurantId);
  if (!guard.ok) return guard.response;
  return respondDownload(await downloadUrl({ kind: "restaurant", restaurantId, userId: guard.userId }, id, fileId));
}

// DELETE /api/admin/missions/[id]/files/[fileId] — retirer un fichier tant qu'il n'est pas verrouillé. Body : { restaurantId }.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const { id, fileId } = await params;
  const body = await req.json().catch(() => null);
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  const guard = await requireMarketplace(restaurantId);
  if (!guard.ok) return guard.response;
  return respondRemove(await removeFile({ kind: "restaurant", restaurantId, userId: guard.userId }, id, fileId));
}
