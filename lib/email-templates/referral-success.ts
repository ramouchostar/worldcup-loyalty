import { emailShell, emailHeading, emailParagraph, emailButton, emailDivider, emailFootNote } from "./layout";

// Client — un ami s'est inscrit via le lien de parrainage (crédité à
// l'inscription réelle, pas au partage — voir app/join/actions.ts). 5
// inscriptions validées = 1 jeton (calculé à l'affichage, jamais stocké).

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://worldcup-loyalty.vercel.app";

export function referralSuccessEmail(
  firstName: string,
  restaurantId: string,
  conversionsCount: number
): { subject: string; html: string; text: string } {
  const microRewardsUrl = `${APP_URL}/r/${restaurantId}/micro-rewards`;
  const remainder = conversionsCount % 5;
  const progressLabel = remainder === 0 ? "Nouveau jeton débloqué !" : `${remainder}/5 vers ton prochain jeton`;
  const subject = "Un ami vient de rejoindre grâce à toi !";

  const html = emailShell(subject, [
    emailHeading("Un ami vient de te rejoindre !"),
    emailParagraph(
      `${firstName}, un ami s'est inscrit grâce à ton lien de parrainage. ${progressLabel}.`
    ),
    emailButton("Voir ma progression →", microRewardsUrl),
    emailDivider(),
    emailFootNote("5 amis inscrits via ton lien = 1 jeton. Illimité — continue de partager pour en accumuler plusieurs."),
  ].join("\n"));

  const text = `Un ami vient de te rejoindre !

${firstName}, un ami s'est inscrit grâce à ton lien de parrainage. ${progressLabel}.

Voir ma progression : ${microRewardsUrl}`;

  return { subject, html, text };
}
