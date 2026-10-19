import { requireProvider } from "@/lib/providers";
import { sendMessage } from "@/lib/missions-messages";
import { respondSend } from "@/lib/missions-messages-http";

// POST /api/prestataire/missions/[id]/messages — le prestataire écrit au restaurateur, dans la mission.
// Body : { body }. Tant que le travail n'a pas commencé, numéros, e-mails et liens de messagerie sont masqués.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireProvider();
  if (!guard.ok) return guard.response;
  const body = await req.json().catch(() => null);
  return respondSend(await sendMessage({ kind: "provider", provider: guard.provider }, id, body));
}
