// ADR 0100 §11 — le lien du menu en ligne : le restaurateur colle l'adresse de son menu numérique (le site de son restaurant,
// le lien de son QR code) au lieu d'envoyer un PDF. SERVEUR UNIQUEMENT.
//
// Le serveur va chercher une adresse écrite par un utilisateur : c'est la porte des attaques par redirection vers le réseau
// interne (SSRF). Mêmes garde-fous que `lib/qr-check.ts` (https, un vrai nom de domaine, jamais d'adresse IP écrite en dur,
// chaque saut jugé et sa résolution DNS contrôlée, 3 redirections au plus), plus : un délai, une taille maximale lue, et le
// texte seul est gardé (jamais de script, jamais de page exécutée). Les liens des plateformes de livraison ne sont pas lus
// ici (ADR 0100 §11) : on le dit, on ne tente pas.

import { lookup } from "node:dns/promises";
import { isPrivateAddress, judgeUrl, URL_ISSUE_TEXT } from "@/lib/safe-url";
import { MAX_PAGE_CHARS, MAX_PDF_BYTES, PdfReadError, type MenuSource } from "./pdf-read";

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 10_000;
/** Une page de menu pèse quelques centaines de Ko : au-delà de 3 Mo, ce n'est pas un menu. */
export const MAX_PAGE_BYTES = 3 * 1024 * 1024;
/** Sous ce seuil, la page n'a presque rien de lisible : elle se construit sans doute avec du JavaScript. */
export const MIN_PAGE_CHARS = 300;

/** Les plateformes de livraison : leurs liens demandent une lecture à part, pas encore ouverte. */
const PLATFORM_LABELS = ["ubereats", "deliveroo", "takeaway", "just-eat", "justeat", "thuisbezorgd", "wolt", "foodora", "glovoapp"];

export const isPlatformHost = (host: string): boolean => host.toLowerCase().split(".").some((label) => PLATFORM_LABELS.includes(label));

/** « monsite.be/menu » sans « https:// » est une adresse que tout le monde écrit : on l'accepte, on ne devine rien d'autre. */
export function normalizeLink(raw: string): string {
  const t = raw.trim();
  return t !== "" && !/^[a-z][a-z0-9+.-]*:/i.test(t) ? `https://${t}` : t;
}

// ─── Du HTML au texte ────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", euro: "€", eacute: "é", egrave: "è", agrave: "à", ccedil: "ç", ecirc: "ê", ocirc: "ô", icirc: "î", ucirc: "û", rsquo: "’", lsquo: "‘", hellip: "…", ndash: "–", mdash: "—" };

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d{1,6});/g, (_m, d: string) => { const c = Number(d); return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : " "; })
    .replace(/&#x([0-9a-f]{1,6});/gi, (_m, h: string) => { const c = parseInt(h, 16); return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : " "; })
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m);
}

/**
 * Le texte lisible d'une page : sans script, sans style, un saut de ligne entre les blocs. Les données structurées d'un menu
 * (schema.org, `application/ld+json`) sont gardées : beaucoup de sites y mettent leur carte en entier. Le résultat est une
 * DONNÉE pour Claude, jamais une consigne.
 */
export function htmlToText(html: string): string {
  const structured: string[] = [];
  const stripped = html.replace(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi, (_m, body: string) => {
    // Seules les données qui parlent d'un menu ou d'un plat : un fil d'Ariane ou un logo n'apprend rien.
    if (body.length < 30_000 && /"@type"\s*:\s*"(Menu|MenuItem|MenuSection|Restaurant|Product|Offer)"/.test(body)) structured.push(body.trim());
    return " ";
  });
  const text = stripped
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|head|template|iframe)\b[\s\S]*?<\/\1>/gi, " ")
    // Beaucoup de sites mettent le NOM du plat seulement dans le texte alternatif de sa photo.
    .replace(/<img\b[^>]*?\balt\s*=\s*"([^"]{2,120})"[^>]*>/gi, "\n$1\n")
    .replace(/<\/(p|div|li|ul|ol|tr|table|section|article|header|footer|h[1-6]|dd|dt|dl|br|nav|main|form)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const body = decodeEntities(text)
    .replace(/[ \t\f\v ]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "")
    .join("\n");
  return [body, ...structured].join("\n").slice(0, MAX_PAGE_CHARS);
}

// ─── Aller chercher la page ──────────────────────────────────────────────────

async function resolvesPublic(host: string): Promise<boolean> {
  try {
    const found = await lookup(host, { all: true, verbatim: true });
    return found.length > 0 && found.every((f) => !isPrivateAddress(f.address));
  } catch {
    return false;
  }
}

/** Les dépendances réseau, remplaçables dans les tests. */
export type LinkDeps = { fetch?: typeof fetch; resolvesPublic?: (host: string) => Promise<boolean> };

/** Lit le corps d'une réponse en s'arrêtant à `max` octets : une page géante ne remplit pas la mémoire du serveur. */
async function readBody(res: Response, max: number): Promise<Uint8Array | null> {
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) { await reader.cancel().catch(() => undefined); return null; }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

/** Ce qu'une adresse rend : un PDF, ou le HTML d'une page (avec son adresse finale, après redirections). */
type Fetched = { kind: "pdf"; bytes: Uint8Array } | { kind: "html"; html: string; url: URL };

/**
 * Va chercher UNE adresse (https, résolution publique, 3 redirections au plus, jugées une à une). Toute impossibilité est une
 * `PdfReadError` qui dit au restaurateur quoi faire (jamais « erreur » tout court).
 */
async function fetchOne(raw: string, deps: LinkDeps, maxPageBytes = MAX_PAGE_BYTES): Promise<Fetched> {
  const fetchImpl = deps.fetch ?? fetch;
  const isPublic = deps.resolvesPublic ?? resolvesPublic;
  let current = judgeUrl(normalizeLink(raw));
  if (!current.ok) throw new PdfReadError(URL_ISSUE_TEXT[current.issue], 400);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = current.url;
    if (isPlatformHost(url.hostname)) {
      throw new PdfReadError("Les liens des plateformes de livraison ne sont pas encore lus ici. Envoie ton PDF, ou le lien du menu sur le site de ton restaurant.", 422);
    }
    if (!(await isPublic(url.hostname))) throw new PdfReadError("Cette adresse n'est pas celle d'un site public.", 400);
    let res: Response;
    try {
      res = await fetchImpl(url.toString(), {
        method: "GET", redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "user-agent": "Boosteats-menu-reader/1.0", accept: "text/html,application/pdf;q=0.9,text/plain;q=0.8" },
      });
    } catch {
      throw new PdfReadError("Ce site ne répond pas pour le moment. Vérifie l'adresse, ou réessaie dans un instant.", 502);
    }

    if (res.status >= 300 && res.status < 400) {
      await res.body?.cancel().catch(() => undefined);
      const location = res.headers.get("location");
      if (!location) throw new PdfReadError("Cette adresse mène à une page d'erreur. Vérifie qu'elle est exacte.", 422);
      let nextUrl: URL;
      try { nextUrl = new URL(location, url); } catch { throw new PdfReadError("Cette adresse renvoie vers une adresse illisible.", 422); }
      const judged = judgeUrl(nextUrl.toString());
      if (!judged.ok) throw new PdfReadError(URL_ISSUE_TEXT[judged.issue], 400);
      current = judged;
      continue;
    }
    if (res.status === 401 || res.status === 403 || res.status === 429) {
      await res.body?.cancel().catch(() => undefined);
      throw new PdfReadError("Ce site refuse la lecture automatique de sa page. Envoie plutôt ton PDF.", 422);
    }
    if (res.status < 200 || res.status >= 300) {
      await res.body?.cancel().catch(() => undefined);
      throw new PdfReadError("Cette adresse mène à une page d'erreur. Vérifie qu'elle est exacte.", 422);
    }

    const type = (res.headers.get("content-type") ?? "").toLowerCase();
    const isPdf = type.includes("application/pdf") || url.pathname.toLowerCase().endsWith(".pdf");
    const isText = type === "" || type.includes("text/html") || type.includes("application/xhtml") || type.includes("text/plain");
    if (!isPdf && !isText) {
      await res.body?.cancel().catch(() => undefined);
      throw new PdfReadError("Cette adresse ne mène pas à une page de menu. Envoie plutôt ton PDF.", 422);
    }
    const bytes = await readBody(res, isPdf ? MAX_PDF_BYTES : maxPageBytes).catch(() => null);
    if (bytes === null) throw new PdfReadError(isPdf ? "Ce PDF est trop lourd (4 Mo au plus)." : "Cette page est trop lourde pour être lue. Envoie plutôt ton PDF.", 413);
    if (isPdf) return { kind: "pdf", bytes };
    return { kind: "html", html: new TextDecoder("utf-8", { fatal: false }).decode(bytes), url };
  }
  throw new PdfReadError("Cette adresse renvoie trop de fois ailleurs. Donne l'adresse finale.", 422);
}

// ─── Le menu réparti sur plusieurs pages ─────────────────────────────────────

/** Sous ce nombre de lettres, la page est un sommaire plutôt qu'un menu : les plats sont sur d'autres pages du même site. */
export const HUB_CHARS = 6_000;
export const MIN_HUB_LINKS = 5;
export const MAX_SUBPAGES = 40;
const SUBPAGE_CONCURRENCY = 6;
const SUBPAGE_BYTES = 1024 * 1024;
const SUBPAGE_CHARS = 3_000;
/** Au-delà, on s'arrête avec ce qu'on a lu : mieux vaut un menu partiel dit tel quel qu'une attente sans fin. */
const CRAWL_BUDGET_MS = 40_000;

/** Les pages qui ne sont jamais le menu : mentions légales, contact, franchise, commande… */
const NOT_MENU = /(contact|faq|news|actualit|blog|politique|privacy|cookie|confidentialit|conditions|terms|cgu|cgv|mentions|franchise|restaurants?|notre-histoire|a-propos|about|login|connexion|compte|account|panier|cart|checkout|order|commande|appels?-d|careers?|jobs?|recrut|sitemap)/i;
const FILE_EXT = /\.(jpe?g|png|gif|webp|svg|ico|css|js|json|xml|zip|pdf|mp4|webm|woff2?)$/i;

/**
 * Les pages du MÊME site que la page d'accueil du menu relie : celles où se trouvent sans doute les plats. Même nom de site
 * (à « www. » près), même langue que la page de départ, jamais une page légale ou de contact, jamais un fichier.
 */
export function menuLinks(html: string, base: URL): string[] {
  const site = base.hostname.replace(/^www\./, "").toLowerCase();
  const lang = /^\/([a-z]{2})(\/|$)/.exec(base.pathname)?.[1];
  const out: string[] = [];
  const seen = new Set<string>([site + base.pathname.replace(/\/+$/, "")]);
  for (const m of html.matchAll(/<a\b[^>]*?\bhref\s*=\s*["']([^"'#][^"']*)["']/gi)) {
    let u: URL;
    try { u = new URL(m[1].replace(/&amp;/g, "&"), base); } catch { continue; }
    if (u.protocol !== "https:" || u.hostname.replace(/^www\./, "").toLowerCase() !== site) continue;
    if (FILE_EXT.test(u.pathname) || NOT_MENU.test(u.pathname)) continue;
    const other = /^\/([a-z]{2})(\/|$)/.exec(u.pathname)?.[1];
    if (lang && other && other !== lang) continue;
    if (u.pathname === "/" || u.pathname === `/${lang}/` || u.pathname === `/${lang}`) continue;
    const key = site + u.pathname.replace(/\/+$/, ""); // « www. » ou non : la même page
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(`${u.origin}${u.pathname}`);
    if (out.length >= MAX_SUBPAGES) break;
  }
  return out;
}

/** Exécute `fn` sur chaque élément, `limit` à la fois, dans l'ordre des résultats. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

/**
 * Le texte du sommaire, puis celui de chaque page liée, sous un titre tiré de son adresse. Ce que le sommaire montre déjà
 * (menu de navigation, pied de page) n'est pas répété sur chaque page : seul ce qui est propre à la page reste.
 */
async function readSubpages(hub: { html: string; url: URL }, hubText: string, deps: LinkDeps): Promise<string> {
  const links = menuLinks(hub.html, hub.url);
  if (links.length < MIN_HUB_LINKS) return hubText;
  const started = Date.now();
  const known = new Set(hubText.split("\n"));
  const pages = await mapLimit(links, SUBPAGE_CONCURRENCY, async (link) => {
    if (Date.now() - started > CRAWL_BUDGET_MS) return null;
    try {
      const f = await fetchOne(link, deps, SUBPAGE_BYTES);
      return f.kind === "html" ? { link, text: htmlToText(f.html) } : null;
    } catch {
      return null; // une page qui ne répond pas ne fait pas échouer les autres
    }
  });
  const parts = [hubText];
  let size = hubText.length;
  for (const p of pages) {
    if (!p) continue;
    const mine: string[] = [];
    const seen = new Set<string>();
    for (const line of p.text.split("\n")) {
      if (known.has(line) || seen.has(line)) continue;
      seen.add(line);
      mine.push(line);
    }
    const body = mine.join("\n").slice(0, SUBPAGE_CHARS);
    if (body.length < 3) continue;
    const title = decodeURIComponent(new URL(p.link).pathname.replace(/\/+$/, "").split("/").pop() ?? "").replace(/-/g, " ");
    const block = `\n## Page « ${title} »\n${body}`;
    if (size + block.length > MAX_PAGE_CHARS) break;
    parts.push(block);
    size += block.length;
  }
  return parts.join("\n");
}

/**
 * Va chercher le menu en ligne et rend ce que Claude peut lire : le texte de la page, ou le PDF si le lien mène à un PDF.
 * Quand la page n'est qu'un sommaire (les plats sont sur une page chacun), les pages du même site qu'elle relie sont lues aussi.
 */
export async function fetchMenuPage(raw: string, deps: LinkDeps = {}): Promise<MenuSource> {
  const first = await fetchOne(raw, deps);
  if (first.kind === "pdf") return first;
  let text = htmlToText(first.html);
  if (text.length < HUB_CHARS) text = await readSubpages(first, text, deps);
  if (text.length < MIN_PAGE_CHARS) {
    throw new PdfReadError("Cette page ne montre presque pas de texte : son menu se charge sans doute avec du JavaScript, que nous ne lisons pas. Envoie plutôt ton PDF.", 422);
  }
  return { kind: "page", text };
}
