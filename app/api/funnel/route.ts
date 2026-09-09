import { NextResponse } from "next/server";
import { isClientReportableStep, recordFunnelStep } from "@/lib/funnel";

// POST /api/funnel — balise d'entonnoir déclarée par le navigateur (ADR 0037).
//
// Volontairement NON authentifiée : les trois étapes qu'elle accepte
// appartiennent au parcours du visiteur, avant tout compte. C'est le même
// régime que le comptage d'atterrissages (`recordLanding`), qui s'écrit aussi
// au simple chargement d'une page publique.
//
// Ce qu'elle accepte est une **liste close** (`CLIENT_REPORTABLE_STEPS`) : les
// étapes qui sont des FAITS serveur (ticket envoyé, validé, refusé, app
// détectée en mode installé) ne passent jamais par ici, elles sont constatées
// là où elles se produisent. Un POST forgé ne peut donc gonfler que des
// compteurs déjà du même ordre de fiabilité qu'un rechargement de page —
// limite assumée et écrite à côté du tableau (ADR 0037 §2), pas masquée.
//
// Aucune donnée personnelle n'entre : ni corps libre, ni en-tête, ni IP. Un
// identifiant d'établissement et un nom d'étape.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) ?? {};
  const restaurantId = typeof body.restaurantId === "string" ? body.restaurantId : "";

  // Toujours 200 : c'est une balise, pas une transaction. Un client qui
  // enverrait n'importe quoi n'a rien à apprendre de notre validation, et le
  // parcours ne doit jamais dépendre de cette réponse.
  if (!restaurantId || !isClientReportableStep(body.step)) {
    return NextResponse.json({ ok: false });
  }

  await recordFunnelStep(restaurantId, body.step);
  return NextResponse.json({ ok: true });
}
