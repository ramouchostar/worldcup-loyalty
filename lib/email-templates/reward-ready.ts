import { emailShell, emailHeading, emailParagraph, emailButton, emailCallout, emailDivider, emailFootNote } from "./layout";

// Client — rappel avant expiration d'une récompense en attente (48h,
// ADR 0011). Envoyé quand elle approche de l'expiration sans avoir été
// récupérée ni mise en réserve. Aucun euro, aucune mention du double
// verrou ou du budget — uniquement le cadeau concret (ADR 0007).

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://worldcup-loyalty.vercel.app";

export function rewardReadyEmail(
  firstName: string,
  restaurantId: string,
  restaurantName: string,
  hoursRemaining: number,
  logoUrl?: string | null
): { subject: string; html: string; text: string } {
  const rewardsUrl = `${APP_URL}/r/${restaurantId}/my-rewards`;
  const subject = `${firstName}, ton cadeau chez ${restaurantName} expire bientôt`;

  const html = emailShell(subject, [
    emailHeading("Ton cadeau t'attend !"),
    emailParagraph(
      `Tu as un cadeau prêt à récupérer chez <strong>${restaurantName}</strong>. Passe le chercher, ` +
      "ou mets-le de côté dans ta réserve si tu préfères attendre."
    ),
    emailCallout(`Il expire dans environ ${Math.max(1, Math.round(hoursRemaining))}h.`),
    emailButton("Voir mon cadeau →", rewardsUrl),
    emailDivider(),
    emailFootNote("Passé ce délai, le cadeau n'est plus disponible — une nouvelle commande en génère un autre."),
  ].join("\n"), logoUrl);

  const text = `Ton cadeau t'attend !

Tu as un cadeau prêt à récupérer chez ${restaurantName}. Passe le chercher, ou mets-le de côté
dans ta réserve si tu préfères attendre.

Il expire dans environ ${Math.max(1, Math.round(hoursRemaining))}h.

Voir mon cadeau : ${rewardsUrl}`;

  return { subject, html, text };
}
