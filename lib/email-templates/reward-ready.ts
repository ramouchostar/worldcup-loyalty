import {
  appLink, button, esc, eyebrow, goodCard, heading, memberShell, paragraph, small, softCard, strong,
  type MemberTheme, type RenderedEmail,
} from "./kit";

// Membre — rappel avant expiration d'un cadeau qui attend (fenêtres :
// lib/reward-window.ts, ADR 0011 amendé). Le cadeau est nommé ; la
// commande minimum de 10 € est écrite, seule valeur en euros admise côté
// membre (ADR 0007, amendement du 2026-09-18). Un cadeau payé en points
// rend ses points s'il expire (ADR 0061) : on le dit, c'est rassurant et vrai.

export type RewardReadyData = {
  theme: MemberTheme;
  restaurantId: string;
  firstName: string | null;
  gift: { name: string; imageUrl: string | null } | null;
  hoursRemaining: number;
  paidWithPoints: boolean;
};

export function rewardReadyEmail(d: RewardReadyData): RenderedEmail {
  const r = d.theme.restaurantName;
  const hours = Math.max(1, Math.round(d.hoursRemaining));
  const name = d.gift?.name ?? null;
  const lead = d.firstName ? `${d.firstName}, ton` : "Ton";
  const subject = `${lead} ${name ?? "cadeau"} chez ${r} expire bientôt`;
  const preheader = `Encore environ ${hours} h pour le récupérer au comptoir.`;
  const url = appLink(`/r/${d.restaurantId}/my-rewards`);

  const body = [
    eyebrow("Cadeau à récupérer"),
    heading(name ? `Ton ${name} t'attend encore` : "Ton cadeau t'attend encore"),
    paragraph(`Passe le chercher chez ${strong(r)}, avec une commande d'au moins 10 €.`),
    name
      ? goodCard({ imageUrl: d.gift?.imageUrl, imageAlt: name, kicker: "À récupérer au comptoir", title: name, note: `Il expire dans environ ${hours} h.` })
      : softCard(esc(`Il expire dans environ ${hours} h.`)),
    button("Voir mon cadeau", url, d.theme.primary),
    small(esc(d.paidWithPoints ? "S'il n'est pas récupéré à temps, tes points te sont rendus." : "Passé ce délai, il n'est plus récupérable.")),
  ];

  const html = memberShell({
    theme: d.theme,
    subject,
    preheader,
    body: body.join("\n"),
    footer: {
      reason: `Tu reçois cet e-mail parce qu'un cadeau t'attend chez ${r}.`,
      manageUrl: appLink("/compte"),
      manageLabel: "Mon compte",
    },
  });

  const text = `${name ? `Ton ${name} t'attend encore` : "Ton cadeau t'attend encore"}

Passe le chercher chez ${r}, avec une commande d'au moins 10 €. Il expire dans environ ${hours} h.
${d.paidWithPoints ? "S'il n'est pas récupéré à temps, tes points te sont rendus." : "Passé ce délai, il n'est plus récupérable."}

Voir mon cadeau : ${url}`;

  return { subject, preheader, html, text };
}
