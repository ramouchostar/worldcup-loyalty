import {
  choiceList, esc, eyebrow, goodCard, heading, linkButton, memberShell, paragraph, small, strong,
  type LinkFn, type MemberTheme, type RenderedEmail, type ShortMessage,
} from "./kit";

// Séquence membre « Rejoins ton équipe » — membre sans équipe dans cet
// établissement. Une fois par semestre au plus : la relance serveur à une
// semaine (ADR 0031 §5) reste la voie principale, l'e-mail n'est que le
// rattrapage de ceux qui ne rouvrent pas l'app.
//
// Règles de la question de reconnaissance (ADR 0031 §3), tenues ici aussi :
// jamais de points ni de nombre de membres à côté d'une communauté, jamais
// d'ordre par score. Un lien d'e-mail n'adhère JAMAIS à lui seul (un GET qui
// écrit serait déclenché par l'aperçu du client mail — ADR 0032 §3) : il
// ouvre la page équipe, où le membre confirme d'un tap.

export type TeamChoice = { id: string; label: string; emoji: string; hasCaptain: boolean };

export type TeamInviteData = {
  theme: MemberTheme;
  restaurantId: string;
  firstName: string | null;
  choices: TeamChoice[]; // 3 au plus, zone du membre d'abord puis au hasard
  // Cadeau du premier palier d'équipe (écran Menu, ADR 0061 §7), s'il existe.
  firstTeamGift: { name: string; imageUrl: string | null } | null;
  link: LinkFn;
  manageUrl: string;
  stopUrl: string;
};

export function teamInviteEmail(d: TeamInviteData): RenderedEmail {
  const r = d.theme.restaurantName;
  const one = d.choices.length === 1 ? d.choices[0] : null;
  const subject = one ? `Tu es de ${one.label} ?` : `Te reconnais-tu dans une de ces équipes chez ${r} ?`;
  const preheader = d.firstTeamGift
    ? `Quand ton équipe franchit un palier, chaque membre reçoit ${d.firstTeamGift.name}.`
    : "Quand ton équipe franchit un palier, chaque membre reçoit un cadeau.";

  const body = [
    eyebrow("Ton équipe"),
    heading(one ? `Tu es de ${one.label} ?` : "Te reconnais-tu dans une de ces équipes ?"),
    paragraph(
      `Chez ${strong(r)}, les clients se regroupent par école, entreprise ou quartier. ` +
      "Quand ton équipe franchit un palier, chaque membre reçoit un cadeau — en plus de ses points."
    ),
    d.firstTeamGift
      ? goodCard({
          imageUrl: d.firstTeamGift.imageUrl,
          imageAlt: d.firstTeamGift.name,
          kicker: "Cadeau d'équipe",
          title: `${d.firstTeamGift.name} pour chaque membre`,
          note: "Au premier palier franchi par ton équipe.",
        })
      : "",
    choiceList(
      d.choices.map((c) => ({
        label: `${c.emoji} ${c.label}`,
        hint: c.hasCaptain ? "C'est la mienne →" : "Sois le premier — tu en deviens capitaine",
        url: d.link(`/r/${d.restaurantId}/my-team?communaute=${encodeURIComponent(c.id)}`),
      }))
    ),
    linkButton("Voir toutes les équipes", d.link(`/r/${d.restaurantId}/my-team`)),
    small(esc("Sans équipe, tes points et tes cadeaux restent les mêmes. Une équipe ajoute des cadeaux en plus.")),
  ];

  const html = memberShell({
    theme: d.theme,
    subject,
    preheader,
    body: body.join("\n"),
    footer: {
      reason: `Tu reçois cet e-mail parce que tu es membre du programme de fidélité de ${r} et que tu n'as pas encore d'équipe.`,
      manageUrl: d.manageUrl,
      stopUrl: d.stopUrl,
      stopLabel: "Ne plus me proposer d'équipe",
    },
  });

  const text = [
    subject,
    "",
    `Chez ${r}, les clients se regroupent par école, entreprise ou quartier. Quand ton équipe franchit un palier, chaque membre reçoit un cadeau — en plus de ses points.`,
    "",
    ...d.choices.map((c) => `${c.emoji} ${c.label} : ${d.link(`/r/${d.restaurantId}/my-team?communaute=${encodeURIComponent(c.id)}`)}`),
    "",
    `Voir toutes les équipes : ${d.link(`/r/${d.restaurantId}/my-team`)}`,
  ].join("\n");

  return { subject, preheader, html, text };
}

export function teamInviteShort(d: Pick<TeamInviteData, "theme" | "restaurantId" | "choices" | "link">): ShortMessage {
  const one = d.choices.length === 1 ? d.choices[0] : null;
  return {
    title: d.theme.restaurantName,
    body: one
      ? `${one.emoji} Tu es de ${one.label} ? Rejoins ton équipe : à chaque palier franchi, chaque membre reçoit un cadeau.`
      : "👥 Te reconnais-tu dans une équipe ? À chaque palier franchi, chaque membre reçoit un cadeau.",
    url: d.link(`/r/${d.restaurantId}/my-team`),
  };
}
