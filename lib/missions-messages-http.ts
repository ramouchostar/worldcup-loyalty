import { NextResponse } from "next/server";
import { SEND_VERDICT_TEXT } from "./mission-messages";
import { BODY_ISSUE_TEXT, type SendResult } from "./missions-messages";

// Les réponses HTTP des routes de la messagerie, communes au restaurateur et au prestataire.

export function respondSend(r: SendResult) {
  if (r.ok) return NextResponse.json({ ok: true, message: r.message, masked: r.masked });
  switch (r.reason) {
    case "invalid":
      return NextResponse.json({ error: BODY_ISSUE_TEXT[r.issue], reason: r.reason }, { status: 422 });
    case "closed":
    case "rate_limited":
      return NextResponse.json({ error: SEND_VERDICT_TEXT[r.reason], reason: r.reason }, { status: r.reason === "closed" ? 409 : 429 });
    case "not_found":
      return NextResponse.json({ error: "Mission introuvable.", reason: r.reason }, { status: 404 });
    default:
      return NextResponse.json({ error: "Impossible pour le moment. Réessaie.", reason: r.reason }, { status: 503 });
  }
}
