import { button, esc, eyebrow, heading, paragraph, proShell, small, type RenderedEmail } from "./kit";

// Prestataire — lien d'invitation à son espace (ADR 0084). Le destinataire n'a
// souvent pas encore de compte : ce qu'on lui propose, ce qu'il doit faire, et
// jusqu'à quand. Le lien est lié à CETTE adresse : on le dit, pour qu'il ne le
// transfère pas et qu'il se connecte avec la bonne.

export const PROVIDER_BRAND_LINE = "Boosteats · des prestataires de confiance pour les restaurateurs";

export function providerInviteEmail(name: string, inviteUrl: string, expiresAt: string, email: string): RenderedEmail {
  const deadline = new Date(expiresAt).toLocaleDateString("fr-BE", { day: "numeric", month: "long", year: "numeric" });
  const subject = "Ton espace prestataire Boosteats";
  const preheader = `Lien personnel, valable jusqu'au ${deadline}.`;

  const body = [
    eyebrow("Invitation"),
    heading("Ton espace prestataire"),
    paragraph(esc(`Bonjour ${name}, des restaurateurs de Bruxelles veulent des vidéos, des photos et des supports. Boosteats te les envoie avec un brief complet : tu lis, tu chiffres, tu fixes ta date.`)),
    paragraph(esc("Chaque devis que tu envoies est ferme pour le brief reçu, et l'acompte est payé avant le tournage. Les deux parties s'engagent sur la date.")),
    button("Activer mon espace prestataire", inviteUrl, "#0C1509"),
    small(esc(`Ce lien est lié à ${email} : connecte-toi avec cette adresse. Il est utilisable une seule fois, jusqu'au ${deadline}.`)),
  ];

  const html = proShell({
    restaurantName: "Boosteats",
    logoUrl: null,
    kicker: "Invitation",
    subject,
    preheader,
    body: body.join("\n"),
    footer: { reason: "Tu reçois cet e-mail parce que Boosteats t'a invité à rejoindre ses prestataires." },
    brandLine: PROVIDER_BRAND_LINE,
  });

  const text = `Ton espace prestataire Boosteats

Bonjour ${name}, des restaurateurs de Bruxelles veulent des vidéos, des photos et
des supports. Boosteats te les envoie avec un brief complet : tu lis, tu chiffres,
tu fixes ta date. Chaque devis est ferme pour le brief reçu ; l'acompte est payé
avant le tournage.

Activer mon espace prestataire : ${inviteUrl}

Ce lien est lié à ${email} : connecte-toi avec cette adresse. Utilisable une seule
fois, jusqu'au ${deadline}.`;

  return { subject, preheader, html, text };
}
