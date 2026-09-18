import {
  button, esc, eyebrow, heading, heroNumber, ideaCard, paragraph, progress, proShell, statGrid, strong, subheading,
  formatEuros, formatInt, type LinkFn, type RenderedEmail, type Stat,
} from "./kit";

// Séquence restaurateur « Cap franchi » — un e-mail par cap, jamais deux le
// même jour (le plus haut franchi l'emporte). Trois familles de caps, dans
// l'unité que le restaurateur regarde : membres inscrits, tickets validés,
// CA programme (euros autorisés côté restaurateur, ADR 0027 §1).
//
// Le cap n'est pas qu'une félicitation : il vient avec le prochain et UNE
// action qui aide à l'atteindre, tirée de ce qui a marché chez lui.

export type MilestoneKind = "members" | "tickets" | "revenue";

export const MILESTONES: Record<MilestoneKind, number[]> = {
  members: [10, 25, 50, 100, 250, 500, 1000, 2500],
  tickets: [50, 100, 250, 500, 1000, 2500, 5000],
  revenue: [1000, 2500, 5000, 10000, 25000, 50000, 100000],
};

// Plus haut cap franchi entre deux relevés — null si aucun.
export function crossedMilestone(kind: MilestoneKind, before: number, now: number): number | null {
  const crossed = MILESTONES[kind].filter((m) => before < m && now >= m);
  return crossed.length ? crossed[crossed.length - 1] : null;
}

export function nextMilestone(kind: MilestoneKind, value: number): number | null {
  return MILESTONES[kind].find((m) => m > value) ?? null;
}

export type MilestoneData = {
  restaurantName: string;
  restaurantId: string;
  logoUrl: string | null;
  kind: MilestoneKind;
  milestone: number;
  current: number;
  sinceLaunch: string; // « en 5 semaines »
  context: Stat[]; // 4 chiffres d'ensemble
  tip: { icon: string; title: string; why: string; cta: { label: string; path: string } } | null;
  link: LinkFn;
  manageUrl: string;
  stopUrl: string;
};

const LABELS: Record<MilestoneKind, { unit: (n: number) => string; big: (n: number) => string }> = {
  members: { unit: (n) => `${formatInt(n)} membres`, big: (n) => formatInt(n) },
  tickets: { unit: (n) => `${formatInt(n)} tickets validés`, big: (n) => formatInt(n) },
  revenue: { unit: (n) => `${formatEuros(n)} de CA programme`, big: (n) => formatEuros(n) },
};

const HERO_LABEL: Record<MilestoneKind, string> = {
  members: "clients inscrits à ton programme",
  tickets: "tickets validés par tes clients",
  revenue: "de chiffre d'affaires passé par le programme",
};

export function milestoneEmail(d: MilestoneData): RenderedEmail {
  const r = d.restaurantName;
  const L = LABELS[d.kind];
  const next = nextMilestone(d.kind, d.current);
  const subject = `🎉 ${L.unit(d.milestone)} chez ${r}`;
  const preheader = next ? `Prochain cap : ${L.unit(next)}. Voici ce qui t'y amène.` : "Un cap que peu d'établissements atteignent.";

  const lead =
    d.kind === "members"
      ? `${esc(d.sinceLaunch)}, ${strong(L.unit(d.milestone))} ont rejoint ton programme. Chacun est un client que tu peux maintenant faire revenir.`
      : d.kind === "tickets"
        ? `${esc(d.sinceLaunch)}, tes clients ont envoyé ${strong(L.unit(d.milestone))}. Chacun te dit ce qui a été commandé, et quand.`
        : `${esc(d.sinceLaunch)}, ${strong(formatEuros(d.milestone))} de commandes directes sont passées par ton programme — sans commission de plateforme.`;

  const body = [
    eyebrow("Cap franchi"),
    heading(`Bravo, ${r} !`),
    heroNumber(L.big(d.milestone), HERO_LABEL[d.kind]),
    paragraph(lead),
    statGrid(d.context),
    next ? subheading(`Prochain cap : ${L.unit(next)}`) : "",
    next ? progress(d.current / next, `${L.big(d.current)} aujourd'hui`) : "",
    d.tip ? ideaCard({ icon: d.tip.icon, title: d.tip.title, why: d.tip.why, cta: { label: d.tip.cta.label, url: d.link(d.tip.cta.path) } }) : "",
    button("Ouvrir ma console", d.link(`/admin/${d.restaurantId}`), "#0C1509"),
  ];

  const html = proShell({
    restaurantName: r,
    logoUrl: d.logoUrl,
    kicker: "Cap franchi",
    subject,
    preheader,
    body: body.join("\n"),
    footer: {
      reason: `Tu reçois cet e-mail parce que tu gères ${r} sur Boosteats.`,
      manageUrl: d.manageUrl,
      stopUrl: d.stopUrl,
      stopLabel: "Ne plus recevoir les caps",
    },
  });

  const text = [
    subject,
    "",
    `${d.sinceLaunch}, ${L.unit(d.milestone)}.`,
    next ? `Prochain cap : ${L.unit(next)}.` : "",
    d.tip ? `${d.tip.title} — ${d.tip.why}` : "",
    "",
    `Ouvrir ma console : ${d.link(`/admin/${d.restaurantId}`)}`,
  ].join("\n");

  return { subject, preheader, html, text };
}
