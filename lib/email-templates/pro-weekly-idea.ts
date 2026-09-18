import {
  esc, eyebrow, heading, ideaCard, linkButton, paragraph, proShell, small,
  type LinkFn, type RenderedEmail,
} from "./kit";
import type { RecapIdea } from "./pro-weekly-recap";

// Séquence restaurateur « L'idée de la semaine » — le jeudi, UNE idée datée
// pour le week-end ou la semaine suivante, seulement quand le moteur de
// stratégies (lib/insights.ts, ADR 0022) en a une qui passe ses seuils de
// données. Pas d'idée solide → pas d'e-mail : un jeudi sans e-mail vaut
// mieux qu'une idée creuse qui apprend à ignorer les suivantes.
//
// Le bouton « Programmer l'annonce » ouvre la page Broadcasts pré-remplie :
// l'annonce part à J-1/J-2 de la promo, jamais plus tôt (ADR 0023).

export type WeeklyIdeaData = {
  restaurantName: string;
  restaurantId: string;
  logoUrl: string | null;
  weekLabel: string;
  idea: RecapIdea;
  otherIdeas: number; // idées encore visibles dans Opportunités
  link: LinkFn;
  manageUrl: string;
  stopUrl: string;
};

export function weeklyIdeaEmail(d: WeeklyIdeaData): RenderedEmail {
  const r = d.restaurantName;
  const subject = `Une idée pour ${r} : ${d.idea.title}`;
  const preheader = "Calculée sur tes ventes, marge protégée — il reste à programmer l'annonce.";

  const body = [
    eyebrow("L'idée de la semaine"),
    heading(d.idea.title),
    paragraph("Calculée sur tes propres ventes, marge protégée article par article. Tu décides, l'app prépare l'annonce."),
    ideaCard({ icon: d.idea.icon, title: "Pourquoi maintenant", why: d.idea.why, when: d.idea.when, cta: { label: d.idea.cta.label, url: d.link(d.idea.cta.path) } }),
    d.otherIdeas > 0
      ? linkButton(`${d.otherIdeas} autre${d.otherIdeas > 1 ? "s" : ""} idée${d.otherIdeas > 1 ? "s" : ""} dans Opportunités`, d.link(`/admin/${d.restaurantId}/insights`))
      : "",
    small(esc("Le message part à tes membres la veille ou l'avant-veille de la promo, jamais plus tôt : une annonce trop précoce déplace des commandes plein tarif vers le jour remisé.")),
  ];

  const html = proShell({
    restaurantName: r,
    logoUrl: d.logoUrl,
    kicker: d.weekLabel,
    subject,
    preheader,
    body: body.join("\n"),
    footer: {
      reason: `Tu reçois cette idée le jeudi parce que tu gères ${r} sur Boosteats.`,
      manageUrl: d.manageUrl,
      stopUrl: d.stopUrl,
      stopLabel: "Ne plus recevoir l'idée de la semaine",
    },
  });

  const text = [
    subject,
    "",
    d.idea.why,
    d.idea.when ?? "",
    "",
    `${d.idea.cta.label} : ${d.link(d.idea.cta.path)}`,
  ].join("\n");

  return { subject, preheader, html, text };
}
