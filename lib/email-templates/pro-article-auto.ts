import { creditParts } from "../restaurant-posts/credit";
import { appLink, esc, linkButton, paragraph, proShell, small, softCard, MAIL, type RenderedEmail } from "./kit";

// ADR 0112 — le message de la veille : « demain à 10 h, on publie cet article chez toi ». Il montre l'article en
// entier, permet de dire non sans se connecter (la page demande un appui) et mène à la console pour le lire ou le
// modifier. Tout texte venu de la base ou d'un tiers est échappé.

export type ArticleAutoMail = {
  restaurantName: string;
  restaurantId: string;
  logoUrl?: string | null;
  /** « samedi » : le jour de la publication, lendemain de l'envoi. */
  weekday: string;
  title: string;
  paragraphs: string[];
  /** Le nom du plat montré avec l'article, lu sur la carte. */
  dishName: string | null;
  /** La mention de source écrite sous l'article. */
  credit: string | null;
  /** Page « Ne pas publier » (jeton signé, sans connexion). */
  refuseUrl: string;
  postId: string;
};

const SUBJECT_TITLE = 50;
const short = (s: string) => (s.length <= SUBJECT_TITLE ? s : `${s.slice(0, SUBJECT_TITLE - 1).trimEnd()}…`);

export const articleAutoSubject = (title: string): string => `Demain 10 h : on publie « ${short(title)} » chez toi`;

/** La mention de source avec ses liens (liste fermée, hors de notre domaine : jamais suivis). */
const creditHtml = (credit: string) =>
  creditParts(credit)
    .map((c) => (c.href ? `<a href="${esc(c.href)}" style="color:${MAIL.muted}; text-decoration:underline;">${esc(c.text)}</a>` : esc(c.text)))
    .join("");
const creditLinks = (credit: string) => creditParts(credit).flatMap((c) => (c.href ? [`${c.text} : ${c.href}`] : []));

export function proArticleAutoEmail(p: ArticleAutoMail): RenderedEmail {
  const subject = articleAutoSubject(p.title);
  const editUrl = appLink(`/admin/${p.restaurantId}/articles/${p.postId}/apercu?de=message`);
  const settingsUrl = appLink(`/admin/${p.restaurantId}/articles/automatique`);
  const intro = `Demain ${p.weekday} à 10 h, cet article sera publié sur la page de commande de ${p.restaurantName}. Tu n'as rien à faire si tu es d'accord.`;
  const preheader = "Tu n'as rien à faire si tu es d'accord. Sinon, un appui suffit.";
  const card = [
    `<div style="color:${MAIL.ink}; font-size:17px; font-weight:700; line-height:1.35; margin-bottom:8px;">${esc(p.title)}</div>`,
    ...p.paragraphs.map((t) => `<div style="margin-bottom:8px;">${esc(t).replace(/\n/g, "<br />")}</div>`),
    p.dishName ? `<div style="color:${MAIL.ink};">Avec le plat : ${esc(p.dishName)}</div>` : "",
    p.credit ? `<div style="margin-top:8px; color:${MAIL.muted}; font-size:12px;">${creditHtml(p.credit)}</div>` : "",
  ].join("");
  const hint = "« Ne pas publier » ouvre une page où tu confirmes d'un appui.";
  const reason = "Tu reçois ce message parce que la publication automatique est activée. Tu peux l'arrêter dans « Mes articles ».";

  const html = proShell({
    restaurantName: p.restaurantName,
    logoUrl: p.logoUrl ?? null,
    kicker: "Mes articles",
    subject,
    preheader,
    body: [
      paragraph("Bonjour,"),
      paragraph(esc(intro)),
      softCard(card),
      linkButton("Ne pas publier", p.refuseUrl),
      linkButton("Lire ou modifier", editUrl),
      small(esc(hint)),
    ].join("\n"),
    footer: { reason, manageUrl: settingsUrl, manageLabel: "Mes articles" },
  });
  const text = [
    subject,
    "",
    "Bonjour,",
    intro,
    "",
    p.title,
    ...p.paragraphs,
    ...(p.dishName ? [`Avec le plat : ${p.dishName}`] : []),
    ...(p.credit ? [p.credit, ...creditLinks(p.credit)] : []),
    "",
    `Ne pas publier : ${p.refuseUrl}`,
    `Lire ou modifier : ${editUrl}`,
    hint,
    "",
    reason,
  ].join("\n");
  return { subject, preheader, html, text };
}
