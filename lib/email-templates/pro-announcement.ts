import { MAIL, appLink, button, esc, eyebrow, heading, paragraph, proShell, subheading, type RenderedEmail } from "./kit";

// Annonce aux restaurateurs, écrite depuis /platform/messages (une nouveauté de la
// console, une information de la plateforme). Le texte est saisi en clair, avec trois
// marques seulement : « ## » pour un intertitre, « - » pour une puce, **gras**.
// Tout est échappé avant la mise en forme : rien de ce qui est saisi ne devient du HTML.

export type AnnouncementBlock =
  | { type: "subheading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] };

export function parseAnnouncement(body: string): AnnouncementBlock[] {
  const blocks: AnnouncementBlock[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ type: "paragraph", text: para.join("\n") });
    if (list.length) blocks.push({ type: "list", items: list });
    para = [];
    list = [];
  };
  for (const raw of body.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
    } else if (line.startsWith("## ")) {
      flush();
      blocks.push({ type: "subheading", text: line.slice(3).trim() });
    } else if (/^[-•] /.test(line)) {
      if (para.length) flush();
      list.push(line.slice(2).trim());
    } else {
      if (list.length) flush();
      para.push(line);
    }
  }
  flush();
  return blocks;
}

/** Échappe, puis rend **gras** et les retours à la ligne. */
function inline(text: string): string {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, `<strong style="color:${MAIL.ink};">$1</strong>`)
    .replace(/\n/g, "<br />");
}

function bulletList(items: string[]): string {
  const rows = items.map(
    (t) => `<tr><td width="18" valign="top" style="padding:0 0 8px; color:${MAIL.ink}; font-size:15px; line-height:1.55;">•</td><td valign="top" style="padding:0 0 8px; color:${MAIL.body}; font-size:15px; line-height:1.55;">${inline(t)}</td></tr>`
  );
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;">${rows.join("")}</table>`;
}

/** Chemin de console accepté : lettres, chiffres, tirets et barres (« pub/nouvelle »). */
export function consolePath(restaurantId: string, path: string | null | undefined): string {
  const clean = (path ?? "").trim().replace(/^\/+|\/+$/g, "");
  return /^[a-z0-9\-/]*$/i.test(clean) && !clean.includes("..") && clean
    ? `/admin/${restaurantId}/${clean}`
    : `/admin/${restaurantId}`;
}

export function proAnnouncementEmail(p: {
  restaurantName: string;
  restaurantId: string;
  logoUrl?: string | null;
  subject: string;
  title: string;
  body: string;
  buttonLabel?: string | null;
  path?: string | null;
}): RenderedEmail {
  const url = appLink(consolePath(p.restaurantId, p.path));
  const blocks = parseAnnouncement(p.body);
  const firstText = blocks.find((b) => b.type === "paragraph") as { text: string } | undefined;
  const preheader = (firstText?.text ?? p.title).replace(/\*\*/g, "").replace(/\s+/g, " ").slice(0, 120);
  const html = proShell({
    restaurantName: p.restaurantName,
    logoUrl: p.logoUrl ?? null,
    kicker: "Nouveautés",
    subject: p.subject,
    preheader,
    body: [
      eyebrow("Nouveautés"),
      heading(p.title),
      ...blocks.map((b) => (b.type === "subheading" ? subheading(b.text) : b.type === "list" ? bulletList(b.items) : paragraph(inline(b.text)))),
      button(p.buttonLabel?.trim() || "Ouvrir ma console", url, "#0C1509"),
    ].join("\n"),
    footer: { reason: `Tu reçois cet e-mail parce que tu gères ${p.restaurantName} sur Boosteats.`, manageUrl: appLink(`/admin/${p.restaurantId}`), manageLabel: "Ma console" },
  });
  const text = [
    p.title,
    "",
    ...blocks.flatMap((b) => (b.type === "subheading" ? ["", b.text.toUpperCase()] : b.type === "list" ? b.items.map((i) => `- ${i}`) : [b.text, ""])),
    "",
    `${p.buttonLabel?.trim() || "Ouvrir ma console"} : ${url}`,
  ]
    .join("\n")
    .replace(/\*\*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { subject: p.subject, preheader, html, text };
}
