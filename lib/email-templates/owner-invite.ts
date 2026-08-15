import { emailShell, emailHeading, emailParagraph, emailButton, emailDivider, emailFootNote } from "./layout";

// Restaurateur — envoyé quand le super-admin génère un lien d'invitation
// restaurateur depuis /platform (ADR 0032). Le destinataire n'a pas forcément de
// compte : le lien mène à une page qui enchaîne inscription → console admin.
// Un seul CTA, aucune donnée du programme (pas de CA, pas de score).

export function ownerInviteEmail(
  restaurantName: string,
  inviteUrl: string,
  expiresAt: string,
  logoUrl?: string | null
): { subject: string; html: string; text: string } {
  const subject = `Ton espace restaurateur pour ${restaurantName}`;
  const deadline = new Date(expiresAt).toLocaleDateString("fr-BE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const html = emailShell(subject, [
    emailHeading(`Ton espace restaurateur pour ${restaurantName}`),
    emailParagraph(
      "Ce lien te donne la main sur la console de ton établissement : catalogue, cadeaux, " +
      "QR code à mettre sur les tables et suivi de tes commandes directes."
    ),
    emailParagraph(
      "Si tu n'as pas encore de compte, tu le crées en deux minutes juste après avoir cliqué — " +
      "le lien te ramène ensuite automatiquement sur ta console."
    ),
    emailButton("Activer mon espace restaurateur →", inviteUrl),
    emailDivider(),
    emailFootNote(`Lien personnel, utilisable une seule fois — valable jusqu'au ${deadline}.`),
  ].join("\n"), logoUrl);

  const text = `Ton espace restaurateur pour ${restaurantName}

Ce lien te donne la main sur la console de ton établissement : catalogue, cadeaux,
QR code à mettre sur les tables et suivi de tes commandes directes.

Si tu n'as pas encore de compte, tu le crées en deux minutes juste après avoir cliqué —
le lien te ramène ensuite automatiquement sur ta console.

Activer mon espace restaurateur : ${inviteUrl}

Lien personnel, utilisable une seule fois — valable jusqu'au ${deadline}.`;

  return { subject, html, text };
}
