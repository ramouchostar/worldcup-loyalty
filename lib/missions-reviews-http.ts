import { NextResponse } from "next/server";
import { REVIEW_ISSUE_TEXT } from "./mission-reviews";
import type { SubmitReviewResult } from "./missions-reviews";

/** La réponse des deux routes d'avis (restaurateur et prestataire) : mêmes causes, mêmes phrases. */
export function reviewResponse(r: SubmitReviewResult): NextResponse {
  if (r.ok) return NextResponse.json({ ok: true });
  switch (r.reason) {
    case "invalid":
      return NextResponse.json({ error: REVIEW_ISSUE_TEXT[r.issues[0].code], reason: r.reason, issues: r.issues }, { status: 422 });
    case "not_finished":
      return NextResponse.json({ error: "Tu pourras noter quand la livraison sera validée.", reason: r.reason }, { status: 409 });
    case "already_reviewed":
      return NextResponse.json({ error: "Tu as déjà donné ton avis sur cette mission.", reason: r.reason }, { status: 409 });
    case "not_found":
      return NextResponse.json({ error: "Mission introuvable.", reason: r.reason }, { status: 404 });
    default:
      return NextResponse.json({ error: "Les avis ne sont pas disponibles pour le moment. Réessaie plus tard.", reason: r.reason }, { status: 503 });
  }
}
