import { button, esc, eyebrow, heading, paragraph, proShell, small, type RenderedEmail } from "./kit";

// Restaurateur — lien d'invitation à la console (ADR 0032, rôle ADR 0041).
// Le destinataire n'a souvent pas encore de compte : pas de lien de
// gestion, seulement ce qu'il y a à faire et jusqu'à quand.

export function ownerInviteEmail(
  restaurantName: string,
  inviteUrl: string,
  expiresAt: string,
  logoUrl?: string | null
): RenderedEmail {
  const deadline = new Date(expiresAt).toLocaleDateString("fr-BE", { day: "numeric", month: "long", year: "numeric" });
  const subject = `Ton espace restaurateur pour ${restaurantName}`;
  const preheader = `Lien personnel, valable jusqu'au ${deadline}.`;

  const body = [
    eyebrow("Invitation"),
    heading(`Ton espace restaurateur pour ${restaurantName}`),
    paragraph(esc("Ce lien te donne la main sur la console de ton établissement : catalogue, cadeaux, QR code à poser sur les tables et suivi de tes commandes directes.")),
    paragraph(esc("Pas encore de compte ? Tu le crées en deux minutes juste après avoir cliqué — le lien te ramène ensuite sur ta console.")),
    button("Activer mon espace restaurateur", inviteUrl, "#0C1509"),
    small(esc(`Lien personnel, utilisable une seule fois — valable jusqu'au ${deadline}.`)),
  ];

  const html = proShell({
    restaurantName,
    logoUrl: logoUrl ?? null,
    kicker: "Invitation",
    subject,
    preheader,
    body: body.join("\n"),
    footer: { reason: `Tu reçois cet e-mail parce qu'on t'a invité à gérer ${restaurantName} sur Boosteats.` },
  });

  const text = `Ton espace restaurateur pour ${restaurantName}

Ce lien te donne la main sur la console de ton établissement : catalogue, cadeaux,
QR code à poser sur les tables et suivi de tes commandes directes.
Pas encore de compte ? Tu le crées en deux minutes juste après avoir cliqué.

Activer mon espace restaurateur : ${inviteUrl}

Lien personnel, utilisable une seule fois — valable jusqu'au ${deadline}.`;

  return { subject, preheader, html, text };
}
