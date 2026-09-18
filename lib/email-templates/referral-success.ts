import {
  appLink, button, esc, eyebrow, heading, memberShell, paragraph, progress, small, strong,
  type MemberTheme, type RenderedEmail,
} from "./kit";

// Membre — un ami vient de s'inscrire par son lien de parrainage (le jeton
// ne compte qu'à l'inscription de l'ami — CONTEXT.md, Parrainage). 5 amis
// inscrits = 1 jeton, sans limite.

export type ReferralSuccessData = {
  theme: MemberTheme;
  restaurantId: string;
  firstName: string | null;
  conversionsCount: number;
};

export function referralSuccessEmail(d: ReferralSuccessData): RenderedEmail {
  const r = d.theme.restaurantName;
  const remainder = d.conversionsCount % 5;
  const earned = remainder === 0 && d.conversionsCount > 0;
  const subject = earned ? `Tu gagnes un jeton chez ${r} !` : `Un ami vient de rejoindre ${r} grâce à toi`;
  const preheader = earned ? "5 amis inscrits par ton lien : un jeton de plus." : `${remainder} ami${remainder > 1 ? "s" : ""} sur 5 pour ton prochain jeton.`;
  const url = appLink(`/r/${d.restaurantId}/micro-rewards`);

  const body = [
    eyebrow("Parrainage"),
    heading(earned ? "Tu gagnes un jeton !" : "Un ami vient de te rejoindre"),
    paragraph(
      `${d.firstName ? `${strong(d.firstName)}, un` : "Un"} ami s'est inscrit chez ${strong(r)} grâce à ton lien. ` +
      (earned ? "C'est le cinquième : un jeton de plus pour toi." : esc("Encore quelques-uns et c'est un jeton de plus."))
    ),
    progress(earned ? 1 : remainder / 5, earned ? "Jeton gagné" : `${remainder} ami${remainder > 1 ? "s" : ""} inscrit${remainder > 1 ? "s" : ""} sur 5 pour ton prochain jeton`),
    button("Voir mes jetons", url, d.theme.primary),
    small(esc("5 amis inscrits par ton lien = 1 jeton, sans limite. 4 jetons = un cadeau au comptoir.")),
  ];

  const html = memberShell({
    theme: d.theme,
    subject,
    preheader,
    body: body.join("\n"),
    footer: {
      reason: `Tu reçois cet e-mail parce qu'un ami s'est inscrit chez ${r} avec ton lien.`,
      manageUrl: appLink("/compte"),
      manageLabel: "Mon compte",
    },
  });

  const text = `${earned ? "Tu gagnes un jeton !" : "Un ami vient de te rejoindre"}

Un ami s'est inscrit chez ${r} grâce à ton lien. ${earned ? "Un jeton de plus pour toi." : `${remainder}/5 vers ton prochain jeton.`}

Voir mes jetons : ${url}`;

  return { subject, preheader, html, text };
}
