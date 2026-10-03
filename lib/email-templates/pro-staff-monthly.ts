import {
  button, esc, eyebrow, formatInt, heading, paragraph, proShell, rankList, small, softCard, statGrid, subheading,
  type LinkFn, type RankRow, type RenderedEmail, type ShortMessage, type Stat,
} from "./kit";

// Séquence restaurateur « Ton équipe en salle ce mois-ci » (ADR 0077 §1) —
// le 2 du mois (le 3 si le 2 tombe un lundi ou un jeudi), le bilan du mois
// civil précédent : chiffres, podium par inscrits, personnes à relancer
// (lib/staff-status.ts). Sans aucun scan du mois, l'e-mail devient une
// relance plutôt qu'un podium vide.
//
// Prénoms seulement (ADR 0053) ; aucun client identifiable (ADR 0025).

export type StaffMonthlyData = {
  restaurantName: string;
  restaurantId: string;
  logoUrl: string | null;
  monthLabel: string; // « septembre 2026 »
  landings: number;
  signups: number;
  signupsPrev: number;
  withTicket: number;
  activeCodes: number; // QR d'équipe actifs aujourd'hui
  podium: RankRow[]; // trois au plus, par inscrits du mois
  best: string | null; // prénom en tête (au moins une inscription)
  nudge: string[]; // prénoms à relancer
  link: LinkFn;
  manageUrl: string;
  stopUrl: string;
};

export function staffMonthlyPath(restaurantId: string): string {
  return `/admin/${restaurantId}/qr#equipe`;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} et ${names[names.length - 1]}`;
}

export function staffMonthlySubject(d: Pick<StaffMonthlyData, "monthLabel" | "landings" | "signups" | "best">): string {
  const month = d.monthLabel.split(" ")[0];
  if (d.landings === 0 && d.signups === 0) return `Les QR de ton équipe n'ont pas servi en ${month}`;
  if (d.best) return `${d.best} termine ${month} en tête, ${formatInt(d.signups)} inscrits par ton équipe`;
  return `Ton équipe en salle en ${month} : ${formatInt(d.landings)} scans de ses QR`;
}

export function staffMonthlyEmail(d: StaffMonthlyData): RenderedEmail {
  const r = d.restaurantName;
  const url = d.link(staffMonthlyPath(d.restaurantId));
  const idle = d.landings === 0 && d.signups === 0;
  const subject = staffMonthlySubject(d);
  const preheader = idle
    ? "D'habitude, c'est que le client ne voit pas le QR. Deux gestes pour relancer."
    : d.nudge.length
      ? `À relancer en ce début de mois : ${joinNames(d.nudge)}.`
      : "Le classement de ton équipe, prénom par prénom.";

  const delta = d.signups - d.signupsPrev;
  const stats: Stat[] = [
    { label: "Scans de leurs QR", value: formatInt(d.landings) },
    {
      label: "Clients inscrits",
      value: formatInt(d.signups),
      delta: d.signupsPrev > 0 || d.signups > 0
        ? { text: delta === 0 ? "comme le mois d'avant" : `${delta > 0 ? "+" : ""}${formatInt(delta)} vs mois d'avant`, direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat" }
        : null,
    },
    { label: "Dont avec un ticket", value: formatInt(d.withTicket) },
    { label: "QR actifs", value: formatInt(d.activeCodes) },
  ];

  const body = idle
    ? [
        eyebrow(`Équipe en salle · ${d.monthLabel}`),
        heading("Les QR de ton équipe n'ont pas servi ce mois-ci"),
        paragraph(esc("Aucun scan en un mois. D'habitude, c'est que le client ne voit pas le QR au moment de payer.")),
        softCard(
          esc("Imprime la planche A4 et donne à chacun sa carte, à poser près de la caisse. Ou renvoie-leur leur badge sur WhatsApp, avec la phrase à dire.")
        ),
        button("Voir mon équipe", url, "#0C1509"),
      ]
    : [
        eyebrow(`Équipe en salle · ${d.monthLabel}`),
        heading(`Ton équipe en salle en ${d.monthLabel.split(" ")[0]}`),
        statGrid(stats),
        d.podium.length ? subheading("Le classement du mois") : "",
        d.podium.length ? rankList(d.podium) : "",
        d.podium.length ? small(esc("Clients inscrits par le QR de chacun, et combien ont déjà envoyé un ticket.")) : "",
        d.nudge.length
          ? softCard(
              `<strong style="color:#9E6612;">À relancer :</strong> ${esc(joinNames(d.nudge))}, presque aucun scan. ` +
              esc("Donne-leur leur carte imprimée ou renvoie-leur le badge.")
            )
          : "",
        d.best ? paragraph(esc(`Un mot pour ${d.best} devant l'équipe, ça compte. La prime reste ta décision.`)) : "",
        button("Voir mon équipe", url, "#0C1509"),
      ];

  const html = proShell({
    restaurantName: r,
    logoUrl: d.logoUrl,
    kicker: d.monthLabel,
    subject,
    preheader,
    body: body.filter(Boolean).join("\n"),
    footer: {
      reason: `Tu reçois ce bilan une fois par mois parce que tu gères ${r} sur Boosteats.`,
      manageUrl: d.manageUrl,
      stopUrl: d.stopUrl,
      stopLabel: "Ne plus recevoir ce bilan",
    },
  });

  const text = [
    `${r} — Équipe en salle, ${d.monthLabel}`,
    subject,
    "",
    idle
      ? "Aucun scan des QR de ton équipe ce mois-ci. Imprime la planche A4 ou renvoie leur badge à chacun."
      : `Scans : ${formatInt(d.landings)} · Inscrits : ${formatInt(d.signups)} · Avec un ticket : ${formatInt(d.withTicket)}`,
    d.podium.length ? `Classement : ${d.podium.map((p, i) => `${i + 1}. ${p.label} (${p.value})`).join(" · ")}` : "",
    d.nudge.length ? `À relancer : ${joinNames(d.nudge)}` : "",
    "",
    `Voir mon équipe : ${url}`,
  ]
    .filter((l) => l !== "")
    .join("\n");

  return { subject, preheader, html, text };
}

export function staffMonthlyShort(d: Pick<StaffMonthlyData, "restaurantId" | "monthLabel" | "landings" | "signups" | "best" | "nudge" | "link">): ShortMessage {
  const month = d.monthLabel.split(" ")[0];
  const capitalized = month.charAt(0).toUpperCase() + month.slice(1);
  let body: string;
  if (d.landings === 0 && d.signups === 0) body = `${capitalized} : les QR de ton équipe n'ont pas servi. Deux gestes pour relancer.`;
  else if (d.best) body = `${capitalized} : ${d.best} en tête, ${formatInt(d.signups)} inscrits par ton équipe.${d.nudge.length ? ` ${joinNames(d.nudge)} ${d.nudge.length > 1 ? "sont" : "est"} à relancer.` : ""}`;
  else body = `${capitalized} : ${formatInt(d.landings)} scans des QR de ton équipe, aucune inscription encore.`;
  return { title: "Équipe en salle", body, url: d.link(staffMonthlyPath(d.restaurantId)) };
}
