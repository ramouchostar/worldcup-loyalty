import { appLink, button, dataTable, esc, eyebrow, heading, paragraph, proShell, small, softCard, type RenderedEmail } from "./kit";

// ADR 0086 §2 et §4 — les e-mails de la Pub. Deux familles :
//   · le restaurateur, à chaque étape de SA pub (console, euros permis : c'est sa dépense) ;
//   · l'alerte plateforme vers PUB_ALERT_EMAIL, une par attente de Mehdi.
// Une ligne = [libellé, valeur] ; les valeurs sont échappées ici.

export type PubRow = [string, string];

export function pubUpdateEmail(p: {
  restaurantName: string;
  restaurantId: string;
  logoUrl?: string | null;
  subject: string;
  title: string;
  intro: string;
  rows?: PubRow[];
  note?: string;
}): RenderedEmail {
  const url = appLink(`/admin/${p.restaurantId}/pub`);
  const preheader = p.intro.slice(0, 120);
  const body = [
    eyebrow("Pub"),
    heading(p.title),
    paragraph(esc(p.intro)),
    p.rows?.length ? dataTable(["", ""], p.rows.map(([k, v]) => [k, v])) : "",
    button("Voir ma pub", url, "#0C1509"),
    p.note ? small(esc(p.note)) : "",
  ];
  const html = proShell({
    restaurantName: p.restaurantName,
    logoUrl: p.logoUrl ?? null,
    kicker: "Pub",
    subject: p.subject,
    preheader,
    body: body.join("\n"),
    footer: { reason: `Tu reçois cet e-mail parce que tu as demandé une pub pour ${p.restaurantName} sur Boosteats.`, manageUrl: url, manageLabel: "Ma pub" },
  });
  const text = [p.title, "", p.intro, "", ...(p.rows ?? []).map(([k, v]) => `${k} : ${v}`), "", url, p.note ?? ""].join("\n").trim();
  return { subject: p.subject, preheader, html, text };
}

export function pubAlertEmail(p: { subject: string; title: string; lines: string[]; rows?: PubRow[]; url?: string }): RenderedEmail {
  const url = p.url ?? appLink("/platform/pub");
  const body = [
    eyebrow("Pub · à faire"),
    heading(p.title),
    ...p.lines.map((l) => paragraph(esc(l))),
    p.rows?.length ? softCard(dataTable(["", ""], p.rows.map(([k, v]) => [k, v]))) : "",
    button("Ouvrir /platform/pub", url, "#0C1509"),
  ];
  const html = proShell({
    restaurantName: "Boosteats",
    logoUrl: null,
    kicker: "Plateforme",
    subject: p.subject,
    preheader: p.lines[0]?.slice(0, 120) ?? p.title,
    body: body.join("\n"),
    footer: { reason: "Alerte de la Pub envoyée à PUB_ALERT_EMAIL (ADR 0086 §2).", manageUrl: url, manageLabel: "/platform/pub" },
    brandLine: "Boosteats · plateforme",
  });
  const text = [p.title, "", ...p.lines, "", ...(p.rows ?? []).map(([k, v]) => `${k} : ${v}`), "", url].join("\n");
  return { subject: p.subject, preheader: p.lines[0] ?? p.title, html, text };
}
