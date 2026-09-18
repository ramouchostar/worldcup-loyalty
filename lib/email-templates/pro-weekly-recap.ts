import {
  dataTable, divider, esc, eyebrow, heading, ideaCard, linkRows, paragraph, proShell, rankList, small, softCard,
  statGrid, subheading, formatEuros, formatInt,
  type LinkFn, type RankRow, type RenderedEmail, type Stat,
} from "./kit";

// Séquence restaurateur « Ta semaine » — chaque lundi matin, la semaine
// lundi → dimanche écoulée. Un seul e-mail hebdomadaire : les chiffres, les
// personnes (équipe en salle, équipes de clients), ce qui se vend, et UNE
// action datée à lancer — le reste des idées vit dans la console.
//
// Ordre voulu : ce qui s'est passé (3 secondes), puis l'action de la semaine
// tant que le lecteur est là, puis le détail. Un restaurateur lit ça debout
// entre deux livraisons.
//
// Euros autorisés (vue restaurateur, ADR 0027 §1) ; jamais le détail d'un
// membre identifiable (ADR 0025) : l'équipe en salle est désignée par prénom
// (ADR 0053), les clients ne le sont jamais.

export type RecapProduct = { name: string; qty: number; unitMargin: number | null; totalMargin: number | null };

export type RecapIdea = {
  icon: string;
  title: string;
  why: string;
  when?: string;
  cta: { label: string; path: string };
};

export type WeeklyRecapData = {
  restaurantName: string;
  restaurantId: string;
  logoUrl: string | null;
  weekLabel: string; // « Semaine 38 · 14 – 20 sept. »
  headline: string; // recapHeadline()
  tickets: number;
  newMembers: number;
  stats: Stat[];
  staff: RankRow[] | null; // null : aucun code salle créé
  teams: RankRow[] | null; // null : aucune équipe active
  products: RecapProduct[];
  recognizedPct: number | null; // part des lignes de tickets rattachées au catalogue (ADR 0046)
  ideas: RecapIdea[]; // la première est l'action de la semaine
  more: { label: string; hint: string; path: string }[];
  link: LinkFn;
  manageUrl: string;
  stopUrl: string;
};

// Phrase d'en-tête : la seule ligne que tout le monde lit. Pure et testable.
export function recapHeadline(input: { tickets: number; ticketsPrev: number; bestTicketsBefore: number; newMembers: number }): string {
  const { tickets, ticketsPrev, bestTicketsBefore, newMembers } = input;
  if (tickets === 0) return "Aucun ticket cette semaine — une annonce peut relancer tes habitués.";
  if (tickets > bestTicketsBefore && bestTicketsBefore > 0) return "Ta meilleure semaine depuis le lancement.";
  if (ticketsPrev > 0 && tickets >= ticketsPrev * 1.15) return "Une semaine nettement au-dessus de la précédente.";
  if (ticketsPrev > 0 && tickets <= ticketsPrev * 0.85) return "Une semaine plus calme que la précédente.";
  if (newMembers >= 10) return `${formatInt(newMembers)} nouveaux clients ont rejoint ton programme.`;
  return "Une semaine dans la lignée de la précédente.";
}

export function weeklyRecapEmail(d: WeeklyRecapData): RenderedEmail {
  const r = d.restaurantName;
  const subject = `Ta semaine chez ${r} : ${formatInt(d.tickets)} tickets, ${formatInt(d.newMembers)} nouveaux membres`;
  const action = d.ideas[0] ?? null;
  const preheader = action ? `L'action de la semaine : ${action.title}` : d.headline;

  const best = d.products.find((p) => p.totalMargin != null && p.totalMargin === Math.max(...d.products.map((x) => x.totalMargin ?? -1)));

  const body = [
    eyebrow("Ta semaine"),
    heading(d.headline),
    statGrid(d.stats),

    action ? subheading("À lancer cette semaine") : "",
    action ? ideaCard({ icon: action.icon, title: action.title, why: action.why, when: action.when, cta: { label: action.cta.label, url: d.link(action.cta.path) } }) : "",

    subheading("Ton équipe en salle"),
    d.staff
      ? rankList(d.staff, { empty: "Aucune inscription par un QR de ton équipe cette semaine." })
      : softCard(
          `Personne de ton équipe n'a encore son QR. Un badge par prénom, et tu sauras qui amène des clients. ` +
          `<a href="${esc(d.link(`/admin/${d.restaurantId}/qr`))}" style="color:#17170F; font-weight:700;">Créer les badges →</a>`
        ),
    d.staff ? small("Inscriptions arrivées par le QR de chacun, et combien ont déjà envoyé un ticket.") : "",

    d.teams && d.teams.length ? subheading("Les équipes de clients") : "",
    d.teams && d.teams.length ? rankList(d.teams) : "",
    d.teams && d.teams.length ? small("Points d'équipe gagnés cette semaine.") : "",

    d.products.length ? subheading("Ce qui se vend — et ce qui rapporte") : "",
    d.products.length
      ? dataTable(
          ["Article", "Vendus", "Marge / u", "Marge"],
          d.products.map((p) => [
            p.name,
            formatInt(p.qty),
            p.unitMargin != null ? `${p.unitMargin.toFixed(2).replace(".", ",")} €` : "—",
            p.totalMargin != null ? formatEuros(p.totalMargin) : "coût ?",
          ])
        )
      : "",
    best && best.totalMargin != null
      ? paragraph(`Le plus rentable de la semaine : <strong style="color:#17170F;">${esc(best.name)}</strong>, ${esc(formatEuros(best.totalMargin))} de marge.`)
      : "",
    d.products.length && d.recognizedPct != null
      ? small(`Sur les tickets photographiés par tes membres — ${d.recognizedPct} % des lignes reconnues dans ton catalogue.`)
      : "",

    d.ideas.length > 1 ? subheading("D'autres idées pour toi") : "",
    ...d.ideas.slice(1, 3).map((i) => ideaCard({ icon: i.icon, title: i.title, why: i.why, when: i.when, cta: { label: i.cta.label, url: d.link(i.cta.path) } })),

    divider(),
    subheading("Aussi dans ta console"),
    linkRows(d.more.map((m) => ({ label: m.label, hint: m.hint, url: d.link(m.path) }))),
  ];

  const html = proShell({
    restaurantName: r,
    logoUrl: d.logoUrl,
    kicker: d.weekLabel,
    subject,
    preheader,
    body: body.join("\n"),
    footer: {
      reason: `Tu reçois ce récap chaque lundi parce que tu gères ${r} sur Boosteats.`,
      manageUrl: d.manageUrl,
      stopUrl: d.stopUrl,
      stopLabel: "Ne plus recevoir le récap",
    },
  });

  const text = [
    `${r} — ${d.weekLabel}`,
    d.headline,
    "",
    ...d.stats.map((s) => `${s.label} : ${s.value}${s.delta ? ` (${s.delta.text})` : ""}`),
    "",
    action ? `À lancer cette semaine : ${action.title} — ${action.why} ${d.link(action.cta.path)}` : "",
    "",
    d.staff?.length ? `Ton équipe en salle : ${d.staff.map((s) => `${s.label} ${s.value}`).join(" · ")}` : "",
    d.teams?.length ? `Équipes : ${d.teams.map((t) => `${t.label} ${t.value}`).join(" · ")}` : "",
    d.products.length ? `Ce qui se vend : ${d.products.map((p) => `${p.name} ×${p.qty}`).join(" · ")}` : "",
    "",
    `Ma console : ${d.link(`/admin/${d.restaurantId}`)}`,
  ].join("\n").replace(/\n{3,}/g, "\n\n");

  return { subject, preheader, html, text };
}
