import { emailShell, emailHeading, emailParagraph, emailButton, emailDivider, emailFootNote } from "./layout";

// Restaurateur — relance si l'onboarding self-service reste inachevé
// (bloqué à l'étape 2 "carte" ou 3 "clé ticket") plus de 48h. Réduit
// l'abandon en pointant directement vers l'étape exacte où il s'est arrêté.

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://worldcup-loyalty.vercel.app";

export function onboardingReminderEmail(
  restaurantName: string,
  restaurantId: string,
  stuckAtStep: 2 | 3
): { subject: string; html: string; text: string } {
  const url =
    stuckAtStep === 2
      ? `${APP_URL}/become-a-partner/${restaurantId}/menu`
      : `${APP_URL}/become-a-partner/${restaurantId}/receipt`;
  const stepLabel = stuckAtStep === 2 ? "ta carte" : "un ticket exemple";
  const remaining = stuckAtStep === 2 ? "2 minutes" : "1 minute";

  const subject = `${restaurantName} — il te reste une étape pour être en ligne`;

  const html = emailShell(subject, [
    emailHeading("Encore une étape !"),
    emailParagraph(
      `${restaurantName} est presque prêt — il ne manque plus que ${stepLabel} pour terminer ` +
      `l'inscription. Ça prend environ ${remaining}.`
    ),
    emailButton("Terminer l'inscription →", url),
    emailDivider(),
    emailFootNote(
      "Ton établissement reste invisible aux clients tant que l'inscription n'est pas terminée."
    ),
  ].join("\n"));

  const text = `Encore une étape !

${restaurantName} est presque prêt — il ne manque plus que ${stepLabel} pour terminer
l'inscription. Ça prend environ ${remaining}.

Terminer l'inscription : ${url}`;

  return { subject, html, text };
}
