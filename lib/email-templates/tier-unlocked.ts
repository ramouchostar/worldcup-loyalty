import {
  appLink, button, eyebrow, goodCard, heading, memberShell, paragraph, strong,
  type MemberTheme, type RenderedEmail,
} from "./kit";

// Membre — cadeau d'équipe (ADR 0061 §7) : l'équipe a franchi un palier,
// chaque membre reçoit le cadeau choisi par le restaurateur, récupérable
// 7 jours. Le cadeau existe déjà quand cet e-mail part (annonce du passage
// de 18 h) : on ne promet rien, on dit ce qui attend. Jamais le score ni la
// mécanique des verrous (ADR 0007).

export type TierUnlockedData = {
  theme: MemberTheme;
  restaurantId: string;
  firstName: string | null;
  teamName: string;
  teamFlag: string | null;
  gift: { name: string; imageUrl: string | null };
};

export function tierUnlockedEmail(d: TierUnlockedData): RenderedEmail {
  const r = d.theme.restaurantName;
  const flag = d.teamFlag ? `${d.teamFlag} ` : "";
  const subject = `${flag}${d.teamName} a franchi un palier : ${d.gift.name} pour chaque membre`;
  const preheader = "Le tien t'attend au comptoir cette semaine.";
  const url = appLink(`/r/${d.restaurantId}/my-rewards`);

  const body = [
    eyebrow("Cadeau d'équipe"),
    heading("Ton équipe a franchi un palier"),
    paragraph(
      `${d.firstName ? `Bonne nouvelle, ${strong(d.firstName)} : ` : "Bonne nouvelle : "}` +
      `${strong(d.teamName)} vient de franchir un palier chez ${strong(r)}. Chaque membre reçoit un cadeau.`
    ),
    goodCard({ imageUrl: d.gift.imageUrl, imageAlt: d.gift.name, kicker: "Le tien t'attend au comptoir", title: d.gift.name, note: "Cette semaine, avec une commande d'au moins 10 €." }),
    button("Voir mon cadeau", url, d.theme.primary),
  ];

  const html = memberShell({
    theme: d.theme,
    subject,
    preheader,
    body: body.join("\n"),
    footer: {
      reason: `Tu reçois cet e-mail parce que ton équipe ${d.teamName} vient de franchir un palier chez ${r}.`,
      manageUrl: appLink("/compte"),
      manageLabel: "Mon compte",
    },
  });

  const text = `Ton équipe a franchi un palier

${d.teamName} vient de franchir un palier chez ${r}. Chaque membre reçoit ${d.gift.name} :
le tien t'attend au comptoir cette semaine, avec une commande d'au moins 10 €.

Voir mon cadeau : ${url}`;

  return { subject, preheader, html, text };
}
