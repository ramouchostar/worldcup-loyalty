import { requireProvider } from "@/lib/providers";
import { confirmUpload } from "@/lib/missions-files";
import { respondConfirm } from "@/lib/missions-files-http";

// POST /api/prestataire/missions/[id]/files/[fileId]/confirm — le fichier est arrivé : on juge son contenu réel.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const { id, fileId } = await params;
  const guard = await requireProvider();
  if (!guard.ok) return guard.response;
  return respondConfirm(await confirmUpload({ kind: "provider", provider: guard.provider }, id, fileId));
}
