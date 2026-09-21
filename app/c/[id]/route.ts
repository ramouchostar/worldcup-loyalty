import { NextResponse, type NextRequest } from "next/server";
import { isSendId, looksLikeBot, safeRedirectPath } from "@/lib/message-links";
import { recordClick } from "@/lib/message-log";

// Redirection de suivi des e-mails (ADR 0063 §6) : /c/<envoi>?to=<chemin>.
// Note le premier clic de l'envoi, puis ouvre la page — toujours sur NOTRE
// domaine (`safeRedirectPath`), jamais une redirection ouverte. Un compteur,
// pas une décision : un scanner de messagerie qui ouvre le lien ne change
// aucun état du membre (contrairement à un GET qui adhérerait — ADR 0032 §3).

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const to = safeRedirectPath(request.nextUrl.searchParams.get("to")) ?? "/";
  if (isSendId(id) && !looksLikeBot(request.headers.get("user-agent"))) {
    await recordClick(id);
  }
  return NextResponse.redirect(new URL(to, request.nextUrl.origin), 302);
}
