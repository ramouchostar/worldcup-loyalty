import { emailShell, emailHeading, emailParagraph, emailButton, emailDivider, emailFootNote } from "./layout";

// Client — palier communautaire franchi, canal email en plus du push/WhatsApp
// existant (ADR 0009, lib/notifications.ts buildMessage). Toujours le cadeau
// concret, jamais le score en euros ni la mécanique du double verrou (ADR 0007).

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://worldcup-loyalty.vercel.app";

export function tierUnlockedEmail(
  firstName: string,
  restaurantId: string,
  restaurantName: string,
  teamName: string,
  teamFlag: string,
  newReward: string
): { subject: string; html: string; text: string } {
  const dashboardUrl = `${APP_URL}/r/${restaurantId}/dashboard`;
  const subject = `${teamFlag} ${teamName} vient de débloquer un palier !`;

  const html = emailShell(subject, [
    emailHeading(`${teamFlag} Palier débloqué !`),
    emailParagraph(
      `Bonne nouvelle, ${firstName} : <strong>${teamName}</strong> vient de franchir un palier chez ` +
      `${restaurantName}. Ta prochaine commande directe inclut désormais <strong>${newReward}</strong>.`
    ),
    emailButton("Voir mon tableau de bord →", dashboardUrl),
    emailDivider(),
    emailFootNote("Plus votre équipe commande directement, plus vous débloquez de cadeaux ensemble."),
  ].join("\n"));

  const text = `Palier débloqué !

Bonne nouvelle, ${firstName} : ${teamName} vient de franchir un palier chez ${restaurantName}.
Ta prochaine commande directe inclut désormais ${newReward}.

Voir mon tableau de bord : ${dashboardUrl}`;

  return { subject, html, text };
}
