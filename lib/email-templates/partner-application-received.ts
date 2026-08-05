import { emailShell, emailHeading, emailParagraph, emailButton, emailDivider, emailFootNote } from "./layout";

// Restaurateur — confirmation immédiate à la soumission de l'étape 1/3
// (/become-a-partner). Rassure sur la suite, pousse à finir l'onboarding
// tout de suite (l'action réelle se passe au clic, cet email est un filet
// de sécurité si l'onglet a été fermé entre-temps).

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://worldcup-loyalty.vercel.app";

export function partnerApplicationReceivedEmail(
  restaurantName: string,
  restaurantId: string
): { subject: string; html: string; text: string } {
  const menuUrl = `${APP_URL}/become-a-partner/${restaurantId}/menu`;
  const subject = `${restaurantName} — ta candidature est bien reçue`;

  const html = emailShell(subject, [
    emailHeading("C'est parti !"),
    emailParagraph(
      `<strong>${restaurantName}</strong> est enregistré. Il reste deux étapes rapides avant la ` +
      "mise en ligne : ta carte (pour calibrer les récompenses) puis un ticket exemple."
    ),
    emailButton("Continuer l'inscription →", menuUrl),
    emailDivider(),
    emailFootNote(
      "Ton établissement restera invisible aux clients jusqu'à validation par notre équipe — un " +
      "contrôle qualité rapide, pas un long processus commercial."
    ),
  ].join("\n"));

  const text = `C'est parti !

${restaurantName} est enregistré. Il reste deux étapes rapides avant la mise en ligne :
ta carte (pour calibrer les récompenses) puis un ticket exemple.

Continuer l'inscription : ${menuUrl}

Ton établissement restera invisible aux clients jusqu'à validation par notre équipe.`;

  return { subject, html, text };
}
