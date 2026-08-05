import { emailShell, emailHeading, emailParagraph, emailButton, emailDivider, emailFootNote } from "./layout";

// Restaurateur — envoyé quand le super-admin valide l'établissement
// (app/platform/actions.ts approveRestaurant, status pending → active).
// C'est le déblocage qui compte le plus : l'établissement devient visible
// et joignable par les clients. CTA vers le QR, l'action concrète pour
// démarrer (pas juste "regarde ton dashboard").

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://worldcup-loyalty.vercel.app";

export function restaurantActivatedEmail(
  restaurantName: string,
  restaurantId: string
): { subject: string; html: string; text: string } {
  const qrUrl = `${APP_URL}/admin/${restaurantId}/qr`;
  const subject = `${restaurantName} est en ligne !`;

  const html = emailShell(subject, [
    emailHeading(`${restaurantName} est en ligne !`),
    emailParagraph(
      "Ton établissement est validé et visible par tes clients. Il ne manque plus que le QR code " +
      "sur tes tables pour commencer à récolter tes premières commandes directes."
    ),
    emailButton("Récupérer mon QR code →", qrUrl),
    emailDivider(),
    emailFootNote(
      "Les supports (sticker, flyer, affiche) sont générés automatiquement aux couleurs de ton établissement."
    ),
  ].join("\n"));

  const text = `${restaurantName} est en ligne !

Ton établissement est validé et visible par tes clients. Il ne manque plus que le QR code
sur tes tables pour commencer à récolter tes premières commandes directes.

Récupérer mon QR code : ${qrUrl}`;

  return { subject, html, text };
}
