import { NextResponse } from "next/server";
import { FILE_ISSUE_TEXT } from "./mission-files";
import type { ConfirmResult, DownloadResult, RemoveResult, RequestResult } from "./missions-files";

// Les réponses HTTP des routes de pièces jointes, communes au restaurateur et au prestataire.

const busy = () => NextResponse.json({ error: "Impossible pour le moment. Réessaie.", reason: "unavailable" }, { status: 503 });

export function respondRequest(r: RequestResult) {
  if (r.ok) return NextResponse.json({ ok: true, id: r.id, uploadUrl: r.uploadUrl, name: r.name });
  if (r.reason === "refused") return NextResponse.json({ error: FILE_ISSUE_TEXT[r.issue], reason: r.issue }, { status: 422 });
  if (r.reason === "not_found") return NextResponse.json({ error: "Mission introuvable.", reason: r.reason }, { status: 404 });
  return busy();
}

export function respondConfirm(r: ConfirmResult) {
  if (r.ok) return NextResponse.json({ ok: true, file: r.file });
  if (r.reason === "refused") return NextResponse.json({ error: FILE_ISSUE_TEXT[r.issue], reason: r.issue }, { status: 422 });
  if (r.reason === "not_found") return NextResponse.json({ error: "Fichier introuvable.", reason: r.reason }, { status: 404 });
  if (r.reason === "not_uploaded") return NextResponse.json({ error: "L'envoi n'est pas arrivé jusqu'au bout. Réessaie.", reason: r.reason }, { status: 409 });
  return busy();
}

export function respondRemove(r: RemoveResult) {
  if (r.ok) return NextResponse.json({ ok: true });
  if (r.reason === "locked") return NextResponse.json({ error: "Ce fichier ne peut plus être retiré.", reason: r.reason }, { status: 409 });
  if (r.reason === "not_found") return NextResponse.json({ error: "Fichier introuvable.", reason: r.reason }, { status: 404 });
  return busy();
}

/** Le téléchargement : on redirige vers le lien signé (60 s). Jamais un lien durable dans une page. */
export function respondDownload(r: DownloadResult) {
  if (r.ok) return NextResponse.redirect(r.url, 302);
  if (r.reason === "not_found") return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
  return busy();
}
