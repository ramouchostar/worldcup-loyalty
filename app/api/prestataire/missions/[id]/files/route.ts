import { requireProvider } from "@/lib/providers";
import { requestUpload } from "@/lib/missions-files";
import { respondRequest } from "@/lib/missions-files-http";

// POST /api/prestataire/missions/[id]/files — demande d'envoi d'une pièce jointe (idée de tournage).
// Body : { scope: "proposal", name, size, type }. Renvoie un lien d'envoi signé.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireProvider();
  if (!guard.ok) return guard.response;
  const body = await req.json().catch(() => null);
  return respondRequest(await requestUpload({ kind: "provider", provider: guard.provider }, id, body));
}
