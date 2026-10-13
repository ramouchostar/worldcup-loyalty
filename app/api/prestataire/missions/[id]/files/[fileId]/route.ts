import { requireProvider } from "@/lib/providers";
import { downloadUrl, removeFile } from "@/lib/missions-files";
import { respondDownload, respondRemove } from "@/lib/missions-files-http";

// GET /api/prestataire/missions/[id]/files/[fileId] — télécharger (lien signé de 60 s, téléchargement forcé).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const { id, fileId } = await params;
  const guard = await requireProvider();
  if (!guard.ok) return guard.response;
  return respondDownload(await downloadUrl({ kind: "provider", provider: guard.provider }, id, fileId));
}

// DELETE /api/prestataire/missions/[id]/files/[fileId] — retirer un fichier tant qu'il n'est pas rattaché à une idée envoyée.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const { id, fileId } = await params;
  const guard = await requireProvider();
  if (!guard.ok) return guard.response;
  return respondRemove(await removeFile({ kind: "provider", provider: guard.provider }, id, fileId));
}
