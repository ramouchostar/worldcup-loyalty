import { NextResponse } from "next/server";
import { isSendId } from "@/lib/message-links";
import { getSendForStop, recordOptOut } from "@/lib/message-log";
import { isSequenceKey } from "@/lib/message-catalog";

// Arrêt en un clic (RFC 8058) : la messagerie POSTe ici quand le destinataire
// touche « Se désabonner » à côté de l'expéditeur. Coupe la séquence de
// l'e-mail reçu, rien d'autre (ADR 0063 §2). Toujours 200 : la messagerie ne
// sait rien faire d'une erreur, et un identifiant inconnu n'a rien à arrêter.

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (isSendId(id)) {
    const send = await getSendForStop(id);
    if (send && isSequenceKey(send.messageKey)) await recordOptOut(send.userId, send.messageKey, "un_clic");
  }
  return NextResponse.json({ ok: true });
}
