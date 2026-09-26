// Kit e-mail v2 — la charpente commune des séquences pilotées depuis la
// plateforme (chantier backlog « Pilotage des notifications et messages
// in-app », 2026-09-18). Remplace à terme `layout.ts` : les gabarits
// historiques y seront migrés un par un.
//
// Trois règles que ce fichier tient pour tous les gabarits :
//
// 1. Tout texte venu de la base est échappé (`esc`). Les gabarits v1
//    interpolaient prénoms et noms d'équipe tels quels : un nom d'équipe
//    contenant du HTML finissait dans l'e-mail de chaque membre.
// 2. Deux habillages, deux publics. Le membre reçoit l'e-mail de SON
//    restaurant (logo, couleur des boutons — ADR 0015), jamais d'euro
//    (ADR 0007/0028) ; le restaurateur reçoit l'outil Boosteats (ADR 0054),
//    euros compris.
// 3. Une bonne nouvelle est verte en dur, jamais dans la couleur de la
//    charte : `brand_accent` résout en rouge chez Belchicken (ADR 0048 §7).
//
// Contraintes des clients mail : tableaux et styles en ligne uniquement
// (Outlook ignore flex/grid), largeur fixe 560 px qui se replie sur mobile,
// aucune police web (repli système), aucune image indispensable à la
// lecture — chaque image a un texte alternatif qui porte le sens.

export type RenderedEmail = {
  subject: string;
  preheader: string;
  html: string;
  text: string;
};

// Message court pour le push, WhatsApp et la carte in-app — même séquence,
// même promesse, dans la place d'une notification.
export type ShortMessage = { title: string; body: string; url: string };

// Construit un lien absolu depuis un chemin de l'app. L'expéditeur y branche
// le suivi des clics (redirection par envoi) ; l'aperçu, une URL nue.
export type LinkFn = (path: string) => string;

export type MemberTheme = {
  restaurantName: string;
  // URL publique absolue (logoPublicUrl) — jamais le chemin brut de
  // `restaurants.logo_url`, qui ne s'affiche dans aucun client mail.
  logoUrl: string | null;
  primary: string; // brand_primary — boutons
  dark: string; // brand_dark — bandeau d'en-tête
};

// Même défaut que app/layout.tsx : le domaine de production.
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://boosteats.tech";
export const appLink: LinkFn = (path) => `${APP_URL}${path}`;

// Habillage d'un e-mail membre sans établissement (bienvenue) : l'identité
// Boosteats par défaut (lib/branding.ts, BRAND_DEFAULTS).
export const BOOSTEATS_THEME: MemberTheme = {
  restaurantName: "Boosteats",
  logoUrl: null,
  primary: "#6B7C3F",
  dark: "#0C1509",
};

export const MAIL = {
  page: "#F1F1EC",
  card: "#FFFFFF",
  ink: "#17170F",
  body: "#45463D",
  muted: "#7C7D72",
  line: "#E6E6DE",
  soft: "#F6F6F1",
  // Bonne nouvelle — vert fixe, indépendant de la charte (ADR 0048 §7)
  goodBg: "#EAF3E3",
  goodLine: "#CBE2BD",
  goodInk: "#2E5E26",
  goodBar: "#5B9A4B",
  // Console Boosteats (ADR 0054) — restaurateur uniquement
  proDark: "#0C1509",
  proAccent: "#A2C523",
  up: "#3F7A34",
  flat: "#7C7D72",
} as const;

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace";

export function esc(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── Enveloppes ──────────────────────────────────────────────────────────────

export type Footer = {
  // Pourquoi cette personne reçoit ce message — une phrase, sans jargon.
  reason: string;
  // Absent quand le destinataire n'a pas encore de compte (invitation).
  manageUrl?: string;
  manageLabel?: string;
  // Présent pour tout message de séquence : on coupe CETTE séquence, pas
  // tout le programme (ADR 0039 — les informations de service restent dues).
  stopUrl?: string;
  stopLabel?: string;
};

function preheaderBlock(preheader: string): string {
  // Texte d'aperçu de la boîte de réception, puis un bourrage invisible pour
  // que le client mail n'y colle pas le début du corps.
  return `<div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:${MAIL.page}; opacity:0;">${esc(preheader)}${"&#8199;&#65279;&#847; ".repeat(40)}</div>`;
}

function documentShell(subject: string, preheader: string, inner: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${esc(subject)}</title>
    <style>
      @media (max-width: 600px) {
        .px { padding-left: 20px !important; padding-right: 20px !important; }
        .stack { display: block !important; width: 100% !important; }
        .stack-gap { padding: 0 0 10px 0 !important; }
        .hide-sm { display: none !important; }
        .h1 { font-size: 24px !important; }
      }
    </style>
  </head>
  <body style="margin:0; padding:0; background-color:${MAIL.page}; font-family:${FONT}; -webkit-text-size-adjust:100%;">
    ${preheaderBlock(preheader)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${MAIL.page}" style="background-color:${MAIL.page};">
      <tr>
        <td align="center" style="padding:28px 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
            ${inner}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function footerBlock(footer: Footer, signature: string): string {
  const links = [
    footer.manageUrl
      ? `<a href="${esc(footer.manageUrl)}" style="color:${MAIL.muted}; text-decoration:underline;">${esc(footer.manageLabel ?? "Gérer mes e-mails")}</a>`
      : null,
    footer.stopUrl
      ? `<a href="${esc(footer.stopUrl)}" style="color:${MAIL.muted}; text-decoration:underline;">${esc(footer.stopLabel ?? "Ne plus recevoir ces rappels")}</a>`
      : null,
  ].filter(Boolean).join(" &nbsp;·&nbsp; ");
  return `<tr>
  <td class="px" style="padding:22px 32px 8px; color:${MAIL.muted}; font-size:12px; line-height:1.6; text-align:center;">
    ${esc(footer.reason)}<br />${links ? `${links}<br />` : ""}<span style="color:#A3A499;">${esc(signature)}</span>
  </td>
</tr>`;
}

// Membre : l'e-mail de SON restaurant. Logo sur pastille blanche (un logo
// sombre disparaîtrait sur brand_dark — même règle que la console, ADR 0054
// §4), nom du restaurant à côté quand il n'y a pas de logo.
export function memberShell(opts: {
  theme: MemberTheme;
  subject: string;
  preheader: string;
  body: string;
  footer: Footer;
  signature?: string;
}): string {
  const { theme } = opts;
  const mark = theme.logoUrl
    ? `<td style="background-color:#FFFFFF; border-radius:12px; padding:6px 10px;" bgcolor="#FFFFFF"><img src="${esc(theme.logoUrl)}" alt="${esc(theme.restaurantName)}" height="30" style="display:block; height:30px; width:auto; border:0;" /></td>`
    : `<td style="background-color:#FFFFFF; border-radius:12px; width:34px; height:34px; text-align:center; font-weight:800; font-size:16px; color:${theme.dark};" bgcolor="#FFFFFF">${esc(theme.restaurantName.slice(0, 1).toUpperCase())}</td>`;

  const inner = `<tr>
  <td bgcolor="${theme.dark}" style="background-color:${theme.dark}; border-radius:20px 20px 0 0; padding:18px 28px;" class="px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      ${mark}
      ${theme.logoUrl ? "" : `<td style="padding-left:12px; color:#FFFFFF; font-size:14px; font-weight:700; letter-spacing:0.01em;">${esc(theme.restaurantName)}</td>`}
    </tr></table>
  </td>
</tr>
<tr>
  <td bgcolor="${MAIL.card}" class="px" style="background-color:${MAIL.card}; border-radius:0 0 20px 20px; padding:32px 32px 28px;">
    ${opts.body}
  </td>
</tr>
${footerBlock(opts.footer, opts.signature ?? `Programme de fidélité ${opts.theme.restaurantName} · propulsé par Boosteats`)}`;
  return documentShell(opts.subject, opts.preheader, inner);
}

// Restaurateur : l'outil Boosteats. Bandeau sombre de la console, marque
// Boosteats à gauche, logo de l'établissement à droite, période en mono.
export function proShell(opts: {
  restaurantName: string;
  logoUrl: string | null;
  kicker: string; // ex. « Semaine 38 · 15 – 21 sept. »
  subject: string;
  preheader: string;
  body: string;
  footer: Footer;
}): string {
  const logo = opts.logoUrl
    ? `<td align="right" class="hide-sm"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#FFFFFF" style="background-color:#FFFFFF; border-radius:10px; padding:5px 9px;"><img src="${esc(opts.logoUrl)}" alt="${esc(opts.restaurantName)}" height="24" style="display:block; height:24px; width:auto; border:0;" /></td></tr></table></td>`
    : "";
  const inner = `<tr>
  <td bgcolor="${MAIL.proDark}" style="background-color:${MAIL.proDark}; border-radius:20px 20px 0 0; padding:20px 28px 22px;" class="px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td>
        <span style="display:inline-block; width:8px; height:8px; border-radius:4px; background-color:${MAIL.proAccent};"></span>
        <span style="color:#FFFFFF; font-size:15px; font-weight:800; letter-spacing:0.02em; padding-left:6px;">Boosteats</span>
        <div style="margin-top:10px; color:rgba(255,255,255,0.62); font-family:${MONO}; font-size:11px; letter-spacing:0.12em; text-transform:uppercase;">${esc(opts.restaurantName)} · ${esc(opts.kicker)}</div>
      </td>
      ${logo}
    </tr></table>
  </td>
</tr>
<tr>
  <td bgcolor="${MAIL.card}" class="px" style="background-color:${MAIL.card}; border-radius:0 0 20px 20px; padding:30px 32px 28px;">
    ${opts.body}
  </td>
</tr>
${footerBlock(opts.footer, "Boosteats · la console de ton programme de fidélité")}`;
  return documentShell(opts.subject, opts.preheader, inner);
}

// ─── Blocs de texte ──────────────────────────────────────────────────────────

export function eyebrow(text: string, color: string = MAIL.muted): string {
  return `<div style="margin:0 0 10px; color:${color}; font-family:${MONO}; font-size:11px; letter-spacing:0.12em; text-transform:uppercase;">${esc(text)}</div>`;
}

export function heading(text: string): string {
  return `<h1 class="h1" style="margin:0 0 14px; color:${MAIL.ink}; font-size:27px; font-weight:800; line-height:1.18; letter-spacing:-0.01em;">${esc(text)}</h1>`;
}

export function subheading(text: string): string {
  return `<h2 style="margin:28px 0 12px; color:${MAIL.ink}; font-size:17px; font-weight:800; line-height:1.3;">${esc(text)}</h2>`;
}

// `html` : texte déjà échappé par l'appelant (autorise <strong>).
export function paragraph(html: string): string {
  return `<p style="margin:0 0 16px; color:${MAIL.body}; font-size:15px; line-height:1.6;">${html}</p>`;
}

export function small(html: string): string {
  return `<p style="margin:0 0 12px; color:${MAIL.muted}; font-size:13px; line-height:1.55;">${html}</p>`;
}

export function strong(text: string): string {
  return `<strong style="color:${MAIL.ink};">${esc(text)}</strong>`;
}

// ─── Boutons ─────────────────────────────────────────────────────────────────

export function button(label: string, url: string, color: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;">
  <tr>
    <td align="center" bgcolor="${color}" style="background-color:${color}; border-radius:14px;">
      <a href="${esc(url)}" style="display:block; padding:15px 20px; color:#FFFFFF; font-size:16px; font-weight:800; text-decoration:none; text-align:center;">${esc(label)}</a>
    </td>
  </tr>
</table>`;
}

export function linkButton(label: string, url: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
  <tr>
    <td align="center" style="border:1px solid ${MAIL.line}; border-radius:14px;">
      <a href="${esc(url)}" style="display:block; padding:13px 20px; color:${MAIL.ink}; font-size:15px; font-weight:700; text-decoration:none; text-align:center;">${esc(label)}</a>
    </td>
  </tr>
</table>`;
}

// ─── Cartes ──────────────────────────────────────────────────────────────────

// La bonne nouvelle : cadeau nommé, points, palier franchi. Vert fixe.
export function goodCard(opts: { imageUrl?: string | null; imageAlt?: string; kicker: string; title: string; note?: string }): string {
  const img = opts.imageUrl
    ? `<td width="72" valign="middle" style="padding-right:14px;"><img src="${esc(opts.imageUrl)}" alt="${esc(opts.imageAlt ?? "")}" width="64" height="64" style="display:block; width:64px; height:64px; border:0; border-radius:14px;" /></td>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;">
  <tr>
    <td bgcolor="${MAIL.goodBg}" style="background-color:${MAIL.goodBg}; border:1px solid ${MAIL.goodLine}; border-radius:16px; padding:16px 18px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        ${img}
        <td valign="middle">
          <div style="color:${MAIL.goodInk}; font-size:12px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase;">${esc(opts.kicker)}</div>
          <div style="color:${MAIL.ink}; font-size:20px; font-weight:800; line-height:1.25; padding-top:3px;">${esc(opts.title)}</div>
          ${opts.note ? `<div style="color:${MAIL.body}; font-size:13px; line-height:1.5; padding-top:4px;">${esc(opts.note)}</div>` : ""}
        </td>
      </tr></table>
    </td>
  </tr>
</table>`;
}

export function softCard(html: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
  <tr>
    <td bgcolor="${MAIL.soft}" style="background-color:${MAIL.soft}; border-radius:14px; padding:14px 16px; color:${MAIL.body}; font-size:14px; line-height:1.55;">${html}</td>
  </tr>
</table>`;
}

// Articles du catalogue « Mes points » : image, nom, prix en points.
// Jamais de prix en euros ni de prix de revient (ADR 0007, ADR 0061 §3).
export type ItemTile = { name: string; points?: number | null; imageUrl?: string | null; caption?: string };

export function itemTiles(items: ItemTile[]): string {
  const cells = items.slice(0, 3).map((it) => {
    const img = it.imageUrl
      ? `<img src="${esc(it.imageUrl)}" alt="" width="56" height="56" style="display:block; margin:0 auto 8px; width:56px; height:56px; border:0; border-radius:12px;" />`
      : "";
    const pts = it.points != null ? `<div style="color:${MAIL.goodInk}; font-size:12px; font-weight:700; padding-top:3px;">${esc(formatInt(it.points))} points</div>` : "";
    const cap = it.caption ? `<div style="color:${MAIL.muted}; font-size:12px; padding-top:3px;">${esc(it.caption)}</div>` : "";
    return `<td width="33%" valign="top" style="padding:0 4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td bgcolor="${MAIL.soft}" align="center" style="background-color:${MAIL.soft}; border-radius:14px; padding:14px 8px;">
          ${img}<div style="color:${MAIL.ink}; font-size:14px; font-weight:700; line-height:1.3;">${esc(it.name)}</div>${pts}${cap}
        </td>
      </tr></table>
    </td>`;
  });
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 -4px 20px;"><tr>${cells.join("")}</tr></table>`;
}

// Barre de progression — remplie par un ratio, jamais annotée d'un chiffre
// en euros. Verte (bonne nouvelle), indépendante de la charte.
export function progress(ratio: number, label?: string): string {
  const pct = Math.max(4, Math.min(100, Math.round(ratio * 100)));
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:2px 0 ${label ? 6 : 18}px;">
  <tr>
    <td bgcolor="${MAIL.line}" style="background-color:${MAIL.line}; border-radius:6px; height:10px; line-height:10px; font-size:0;">
      <table role="presentation" width="${pct}%" cellpadding="0" cellspacing="0"><tr><td bgcolor="${MAIL.goodBar}" style="background-color:${MAIL.goodBar}; border-radius:6px; height:10px; line-height:10px; font-size:0;">&nbsp;</td></tr></table>
    </td>
  </tr>
</table>${label ? `<div style="margin:0 0 18px; color:${MAIL.muted}; font-size:12px;">${esc(label)}</div>` : ""}`;
}

// Étapes réellement ordonnées (installer l'app : 1 puis 2 puis 3).
export function steps(items: string[]): string {
  const rows = items.map((html, i) => `<tr>
    <td width="30" valign="top" style="padding:0 0 12px;">
      <div style="width:24px; height:24px; border-radius:12px; background-color:${MAIL.ink}; color:#FFFFFF; font-size:12px; font-weight:800; line-height:24px; text-align:center;">${i + 1}</div>
    </td>
    <td valign="top" style="padding:2px 0 12px 8px; color:${MAIL.body}; font-size:14px; line-height:1.5;">${html}</td>
  </tr>`);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 10px;">${rows.join("")}</table>`;
}

// Liste de choix (communautés proposées) : une ligne cliquable par choix.
export function choiceList(choices: { label: string; hint?: string; url: string }[]): string {
  const rows = choices.map((c) => `<tr><td style="padding:0 0 8px;">
    <a href="${esc(c.url)}" style="display:block; border:1px solid ${MAIL.line}; border-radius:14px; padding:13px 16px; text-decoration:none;">
      <span style="color:${MAIL.ink}; font-size:15px; font-weight:700;">${esc(c.label)}</span>
      ${c.hint ? `<br /><span style="color:${MAIL.muted}; font-size:12px;">${esc(c.hint)}</span>` : ""}
    </a>
  </td></tr>`);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;">${rows.join("")}</table>`;
}

export function divider(): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:10px 0 6px;"><tr><td style="border-top:1px solid ${MAIL.line}; font-size:0; line-height:0;">&nbsp;</td></tr></table>`;
}

// ─── Blocs restaurateur (euros autorisés — ADR 0027 §1) ─────────────────────

// Le chiffre d'un cap franchi, en très grand.
export function heroNumber(value: string, label: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;"><tr>
  <td bgcolor="${MAIL.goodBg}" style="background-color:${MAIL.goodBg}; border:1px solid ${MAIL.goodLine}; border-radius:18px; padding:22px 20px 20px;" align="center">
    <div style="color:${MAIL.ink}; font-size:64px; font-weight:800; line-height:1; letter-spacing:-0.03em; font-variant-numeric:tabular-nums;">${esc(value)}</div>
    <div style="color:${MAIL.goodInk}; font-size:14px; font-weight:700; padding-top:8px;">${esc(label)}</div>
  </td>
</tr></table>`;
}

export type Stat = {
  label: string;
  value: string;
  // Variation vs la période précédente. Une baisse n'est pas une panne :
  // elle reste neutre, jamais rouge (ADR 0054 §2).
  delta?: { text: string; direction: "up" | "down" | "flat" } | null;
};

export function statGrid(stats: Stat[]): string {
  const cell = (s: Stat) => {
    const delta = s.delta
      ? `<div style="padding-top:6px; font-size:12px; font-weight:700; color:${s.delta.direction === "up" ? MAIL.up : MAIL.flat};">${s.delta.direction === "up" ? "▲" : s.delta.direction === "down" ? "▼" : "="} ${esc(s.delta.text)}</div>`
      : `<div style="padding-top:6px; font-size:12px; color:${MAIL.muted};">&nbsp;</div>`;
    return `<td class="stack stack-gap" width="50%" valign="top" style="padding:0 5px 10px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td bgcolor="${MAIL.soft}" style="background-color:${MAIL.soft}; border-radius:14px; padding:14px 16px;">
          <div style="color:${MAIL.muted}; font-family:${MONO}; font-size:10px; letter-spacing:0.1em; text-transform:uppercase;">${esc(s.label)}</div>
          <div style="padding-top:6px; color:${MAIL.ink}; font-size:28px; font-weight:800; line-height:1; font-variant-numeric:tabular-nums;">${esc(s.value)}</div>
          ${delta}
        </td>
      </tr></table>
    </td>`;
  };
  const rows: string[] = [];
  for (let i = 0; i < stats.length; i += 2) {
    rows.push(`<tr>${cell(stats[i])}${stats[i + 1] ? cell(stats[i + 1]) : `<td class="stack" width="50%"></td>`}</tr>`);
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 -5px 8px;">${rows.join("")}</table>`;
}

// Classement : le rang est une vraie information d'ordre, d'où la
// numérotation. La barre compare chaque ligne à la première.
export type RankRow = { label: string; hint?: string; value: string; ratio: number };

export function rankList(rows: RankRow[], opts?: { empty?: string }): string {
  if (rows.length === 0) return softCard(esc(opts?.empty ?? "Rien cette semaine."));
  const body = rows.map((r, i) => {
    const pct = Math.max(3, Math.min(100, Math.round(r.ratio * 100)));
    return `<tr>
      <td width="26" valign="top" style="padding:10px 0; color:${i === 0 ? MAIL.ink : MAIL.muted}; font-size:14px; font-weight:800; font-variant-numeric:tabular-nums;">${i + 1}</td>
      <td valign="top" style="padding:10px 10px 10px 0;">
        <div style="color:${MAIL.ink}; font-size:14px; font-weight:700;">${esc(r.label)}</div>
        ${r.hint ? `<div style="color:${MAIL.muted}; font-size:12px; padding-top:2px;">${esc(r.hint)}</div>` : ""}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:7px;"><tr>
          <td bgcolor="${MAIL.soft}" style="background-color:${MAIL.soft}; border-radius:4px; height:6px; line-height:6px; font-size:0;">
            <table role="presentation" width="${pct}%" cellpadding="0" cellspacing="0"><tr><td bgcolor="${i === 0 ? MAIL.ink : "#B9BAB0"}" style="background-color:${i === 0 ? MAIL.ink : "#B9BAB0"}; border-radius:4px; height:6px; line-height:6px; font-size:0;">&nbsp;</td></tr></table>
          </td>
        </tr></table>
      </td>
      <td width="84" align="right" valign="top" style="padding:10px 0; color:${MAIL.ink}; font-size:14px; font-weight:800; font-variant-numeric:tabular-nums; white-space:nowrap;">${esc(r.value)}</td>
    </tr>`;
  });
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px; border-top:1px solid ${MAIL.line};">${body.join(`<tr><td colspan="3" style="border-top:1px solid ${MAIL.line}; font-size:0; line-height:0;">&nbsp;</td></tr>`)}</table>`;
}

// Tableau compact (produits) — colonnes numériques alignées à droite.
export function dataTable(head: string[], rows: string[][], opts?: { highlightFirst?: boolean }): string {
  const th = head.map((h, i) => `<td align="${i === 0 ? "left" : "right"}" style="padding:0 0 8px; color:${MAIL.muted}; font-family:${MONO}; font-size:10px; letter-spacing:0.1em; text-transform:uppercase; white-space:nowrap;">${esc(h)}</td>`).join("");
  const tr = rows.map((r, ri) => `<tr>${r.map((c, i) => `<td align="${i === 0 ? "left" : "right"}" style="padding:9px 0 9px ${i === 0 ? 0 : 10}px; border-top:1px solid ${MAIL.line}; color:${MAIL.ink}; font-size:14px; ${i === 0 && opts?.highlightFirst && ri === 0 ? "font-weight:800;" : i === 0 ? "font-weight:600;" : "font-variant-numeric:tabular-nums;"}">${esc(c)}</td>`).join("")}</tr>`).join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;"><tr>${th}</tr>${tr}</table>`;
}

// Une idée d'action : titre, pourquoi (chiffres à l'appui), quand, bouton.
export function ideaCard(opts: { icon: string; title: string; why: string; when?: string; cta?: { label: string; url: string } }): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;">
  <tr>
    <td style="border:1px solid ${MAIL.line}; border-radius:16px; padding:16px 18px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td width="40" valign="top" style="font-size:24px; line-height:1;">${esc(opts.icon)}</td>
        <td valign="top">
          <div style="color:${MAIL.ink}; font-size:16px; font-weight:800; line-height:1.3;">${esc(opts.title)}</div>
          <div style="color:${MAIL.body}; font-size:13px; line-height:1.55; padding-top:5px;">${esc(opts.why)}</div>
          ${opts.when ? `<div style="color:${MAIL.muted}; font-family:${MONO}; font-size:11px; letter-spacing:0.06em; padding-top:8px;">${esc(opts.when)}</div>` : ""}
          ${opts.cta ? `<div style="padding-top:12px;"><a href="${esc(opts.cta.url)}" style="display:inline-block; background-color:${MAIL.proDark}; color:#FFFFFF; font-size:13px; font-weight:800; text-decoration:none; border-radius:10px; padding:10px 14px;">${esc(opts.cta.label)}</a></div>` : ""}
        </td>
      </tr></table>
    </td>
  </tr>
</table>`;
}

// Liens vers les autres écrans de la console — une ligne chacun.
export function linkRows(links: { label: string; hint: string; url: string }[]): string {
  const rows = links.map((l) => `<tr><td style="padding:10px 0; border-top:1px solid ${MAIL.line};">
    <a href="${esc(l.url)}" style="text-decoration:none;"><span style="color:${MAIL.ink}; font-size:14px; font-weight:700;">${esc(l.label)} →</span><br /><span style="color:${MAIL.muted}; font-size:12px;">${esc(l.hint)}</span></a>
  </td></tr>`);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">${rows.join("")}</table>`;
}

// ─── Formats ────────────────────────────────────────────────────────────────

export function formatInt(n: number): string {
  return Math.round(n).toLocaleString("fr-BE");
}

export function formatEuros(n: number): string {
  return `${Math.round(n).toLocaleString("fr-BE")} €`;
}

export function formatDelta(current: number, previous: number): Stat["delta"] {
  if (previous <= 0) return current > 0 ? { text: "nouveau", direction: "up" } : null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return { text: "stable", direction: "flat" };
  return { text: `${pct > 0 ? "+" : ""}${pct} % vs sem. préc.`, direction: pct > 0 ? "up" : "down" };
}

// Prénom d'appel : le premier mot du nom d'affichage, sinon « toi » (règle
// historique des e-mails membres, ADR 0047 §4).
export function firstNameOf(displayName: string | null | undefined): string | null {
  const first = displayName?.trim().split(/\s+/)[0];
  return first ? first : null;
}
