import {
  BOOSTEATS_THEME, appLink, button, esc, eyebrow, firstNameOf, heading, memberShell, paragraph, small,
  type RenderedEmail,
} from "./kit";

// Membre — bienvenue, envoyé une seule fois, au premier consentement
// (auth/callback ou /register, ADR 0047), avant même qu'il ait rejoint un
// établissement : habillage Boosteats, pas celui d'un restaurant.

export function welcomeEmail(displayName: string): RenderedEmail {
  const first = firstNameOf(displayName === "toi" ? null : displayName);
  const subject = first ? `Bienvenue chez Boosteats, ${first} !` : "Bienvenue chez Boosteats !";
  const preheader = "Un ticket de caisse en photo, des points, le cadeau de ton choix.";
  const joinUrl = appLink("/join");

  const body = [
    eyebrow("Bienvenue"),
    heading(first ? `Bienvenue, ${first} !` : "Bienvenue !"),
    paragraph(
      "Ton compte est prêt. À chaque commande passée directement au restaurant — sur place, à emporter " +
      "ou par téléphone — prends ton ticket de caisse en photo dans l'app : tu gagnes des points, à échanger " +
      "contre le cadeau de ton choix."
    ),
    button("Choisir mon restaurant", joinUrl, BOOSTEATS_THEME.primary),
    small(esc("Gratuit, sans carte bancaire, sans abonnement — et ça ne changera jamais.")),
  ];

  const html = memberShell({
    theme: BOOSTEATS_THEME,
    subject,
    preheader,
    body: body.join("\n"),
    footer: {
      reason: "Tu reçois cet e-mail parce que tu viens de créer ton compte Boosteats.",
      manageUrl: appLink("/compte"),
      manageLabel: "Mon compte",
    },
    signature: "Boosteats · la fidélité des restaurants de quartier",
  });

  const text = `${first ? `Bienvenue, ${first} !` : "Bienvenue !"}

Ton compte est prêt. À chaque commande passée directement au restaurant, prends ton ticket
de caisse en photo dans l'app : tu gagnes des points, à échanger contre le cadeau de ton choix.

Choisir mon restaurant : ${joinUrl}

Gratuit, sans carte bancaire, sans abonnement.`;

  return { subject, preheader, html, text };
}
