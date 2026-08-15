import Anthropic from "@anthropic-ai/sdk";
import { isValidHex } from "./branding";

// Détection de design (m48) : suggère une charte graphique (couleurs +
// police + note de style) à partir du site web d'un établissement, en
// best-effort réseau (mShots, og:image) + un unique appel vision. L'app
// propose, le restaurateur décide (même principe que la grille par défaut
// et les suggestions de cadeaux, ADR 0013/0017) — rien n'est jamais écrit en
// base par ce module.

export type ImageBlock = { base64: string; mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" };

export type DesignSuggestion = {
  brand_primary: string;
  brand_dark: string;
  brand_accent: string;
  brand_font: string;
  style_notes: string;
};

const FONT_KEYS = ["inter", "poppins", "playfair", "dm_sans", "bebas_neue"] as const;

// Toute image plus petite est un pixel de suivi ou un placeholder d'erreur,
// jamais un visuel exploitable.
const MIN_IMAGE_BYTES = 500;

// Un screenshot 1200×900 d'un vrai site pèse plusieurs dizaines de Ko ;
// l'image d'attente de mShots (fond gris uni tant que le rendu n'est pas
// terminé) quelques Ko seulement. Sans ce seuil elle passe tous les contrôles
// et le modèle « analyse » une image vide en inventant une charte plausible.
const SCREENSHOT_MIN_BYTES = 15_000;

// Une photo réellement publiée sur un réseau dépasse largement ce seuil ;
// les visuels de marque des plateformes sont des logos légers.
const SOCIAL_MIN_BYTES = 8_000;

// Budget total de l'attente mShots : au-delà, l'appelant retombe sur og:image
// plutôt que de faire patienter le restaurateur. En pratique le rendu est prêt
// au premier ou deuxième passage.
const SCREENSHOT_DEADLINE_MS = 20_000;

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function guessMediaType(contentType: string | null): ImageBlock["mediaType"] | null {
  if (!contentType) return null;
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "image/jpeg";
  if (contentType.includes("png")) return "image/png";
  if (contentType.includes("gif")) return "image/gif";
  if (contentType.includes("webp")) return "image/webp";
  return null;
}

async function responseToImageBlock(res: Response, minBytes = MIN_IMAGE_BYTES): Promise<ImageBlock | null> {
  const mediaType = guessMediaType(res.headers.get("content-type"));
  if (!mediaType) return null;
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength < minBytes) return null; // placeholder d'erreur / d'attente, pas un visuel
  return { base64: Buffer.from(bytes).toString("base64"), mediaType };
}

// Capture best-effort du rendu d'un site via mShots (WordPress, gratuit, sans
// clé). Le premier appel ne fait que déclencher le rendu : mShots répond son
// image d'attente tant que la page n'est pas capturée, et rien dans la réponse
// (statut, content-type) ne la distingue d'un vrai screenshot — seul son poids
// la trahit, d'où le seuil SCREENSHOT_MIN_BYTES. On repasse donc jusqu'à ce
// que l'image soit assez lourde pour être un vrai rendu, dans la limite de
// SCREENSHOT_DEADLINE_MS. Ne throw jamais : renvoie null si tout échoue,
// l'appelant retombe sur og:image.
export async function captureWebsiteScreenshot(url: string): Promise<ImageBlock | null> {
  const mshotsUrl = `https://s.wordpress.com/mshots/v1/${encodeURIComponent(url)}?w=1200&h=900`;
  const deadline = Date.now() + SCREENSHOT_DEADLINE_MS;
  try {
    await fetchWithTimeout(mshotsUrl, 8000); // déclenche le rendu, résultat ignoré
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3500));
      const res = await fetchWithTimeout(mshotsUrl, 8000);
      const block = res ? await responseToImageBlock(res, SCREENSHOT_MIN_BYTES) : null;
      if (block) return block;
    }
    return null;
  } catch {
    return null;
  }
}

// Extraction best-effort de la meta og:image d'une page publique (site,
// Instagram, TikTok). Instagram/TikTok bloquent la plupart des requêtes non
// authentifiées — échec silencieux attendu et normal, jamais surfacé.
// Aucune lib de parsing HTML dans le repo : extraction par regex, volontaire.
export async function fetchOgImage(pageUrl: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(pageUrl, 6000);
    if (!res) return null;
    const html = (await res.text()).slice(0, 200_000); // borne la lecture
    const match =
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(html) ??
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i.exec(html);
    if (!match) return null;
    return new URL(match[1], pageUrl).toString();
  } catch {
    return null;
  }
}

export async function fetchImageAsBlock(imageUrl: string, minBytes = MIN_IMAGE_BYTES): Promise<ImageBlock | null> {
  try {
    const res = await fetchWithTimeout(imageUrl, 6000);
    if (!res) return null;
    return await responseToImageBlock(res, minBytes);
  } catch {
    return null;
  }
}

// Derrière un mur de connexion — cas normal pour Instagram/TikTok non
// authentifiés — la page renvoie le visuel de MARQUE DE LA PLATEFORME en
// og:image, hébergé sur ses domaines et chemins « static ». L'analyser revient
// à proposer les couleurs d'Instagram à l'établissement (le rose #E1306C
// observé en production venait exactement de là). Seules les images servies
// par un CDN de contenu (photo réellement publiée) sont exploitables.
function isPlatformAsset(imageUrl: string): boolean {
  let u: URL;
  try {
    u = new URL(imageUrl);
  } catch {
    return true;
  }
  const host = u.hostname.toLowerCase();
  const path = u.pathname.toLowerCase();
  if (/(^|\.)static[.-]/.test(host)) return true; // static.cdninstagram.com
  if (host.includes("ttwstatic") || host.includes("-static.")) return true; // assets webapp TikTok
  if (path.startsWith("/rsrc.php")) return true; // bundles Meta
  if (path.includes("/static/")) return true; // instagram.com/static/images/…
  return /(favicon|logo|sprite|share[-_.]|default[-_.])/.test(path);
}

// og:image d'un profil social, en bonus de l'analyse du site : plus exigeant
// que le site lui-même, parce qu'une image générique ici contamine la charte
// proposée avec les couleurs de la plateforme.
export async function fetchSocialImageAsBlock(pageUrl: string): Promise<ImageBlock | null> {
  const ogUrl = await fetchOgImage(pageUrl);
  if (!ogUrl || isPlatformAsset(ogUrl)) return null;
  return await fetchImageAsBlock(ogUrl, SOCIAL_MIN_BYTES);
}

// Analyse vision : un directeur artistique fictif propose une charte à partir
// des images fournies (screenshot site en priorité + bonus Insta/TikTok).
// Reprend le pattern multi-images de lib/receipt-key-discovery.ts (Sonnet 5,
// concaténation de tous les blocs texte, extraction JSON par sous-chaîne).
// Seule étape non best-effort : peut throw (réseau, clé absente, JSON
// invalide) — géré par l'appelant (server action), jamais par ce module.
export async function analyzeDesign(images: ImageBlock[], restaurantName: string): Promise<DesignSuggestion> {
  if (images.length === 0) throw new Error("analyzeDesign: aucune image fournie");

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const imageBlocks = images.slice(0, 3).map((img) => ({
    type: "image" as const,
    source: { type: "base64" as const, media_type: img.mediaType, data: img.base64 },
  }));

  const msg = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: [
          ...imageBlocks,
          {
            type: "text",
            text: `Tu es directeur artistique. Ces images montrent le site web (et éventuellement les réseaux sociaux) du restaurant "${restaurantName}". Propose une charte graphique pour son application de fidélité :

1. brand_primary : couleur hex #RRGGBB pour les boutons et liens (doit contraster suffisamment avec du texte blanc dessus).
2. brand_dark : couleur hex #RRGGBB pour les en-têtes et fonds sombres.
3. brand_accent : couleur hex #RRGGBB pour les badges et mises en avant.
4. brand_font : EXACTEMENT une valeur parmi cette liste, celle qui correspond le mieux à l'ambiance visuelle : "inter" (neutre moderne), "poppins" (rond, amical), "playfair" (élégant, haut de gamme), "dm_sans" (chaleureux, moderne), "bebas_neue" (impact, énergique, street-food).
5. style_notes : une phrase courte en français décrivant l'ambiance perçue (ex. "ambiance chaleureuse et artisanale").

Réponds UNIQUEMENT en JSON, sans markdown :
{"brand_primary":"#RRGGBB","brand_dark":"#RRGGBB","brand_accent":"#RRGGBB","brand_font":"...","style_notes":"..."}`,
          },
        ],
      },
    ],
  });

  const rawText = msg.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  const jsonStart = rawText.indexOf("{");
  const jsonEnd = rawText.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd <= jsonStart) {
    throw new Error(`analyzeDesign: pas de JSON dans la réponse (${rawText.slice(0, 120)})`);
  }
  const parsed = JSON.parse(rawText.slice(jsonStart, jsonEnd + 1)) as Partial<DesignSuggestion>;

  const primary = typeof parsed.brand_primary === "string" && isValidHex(parsed.brand_primary) ? parsed.brand_primary.toUpperCase() : null;
  const dark = typeof parsed.brand_dark === "string" && isValidHex(parsed.brand_dark) ? parsed.brand_dark.toUpperCase() : null;
  const accent = typeof parsed.brand_accent === "string" && isValidHex(parsed.brand_accent) ? parsed.brand_accent.toUpperCase() : null;
  const font = typeof parsed.brand_font === "string" && (FONT_KEYS as readonly string[]).includes(parsed.brand_font) ? parsed.brand_font : null;
  if (!primary || !dark || !accent || !font) {
    throw new Error("analyzeDesign: réponse du modèle invalide ou incomplète");
  }

  return {
    brand_primary: primary,
    brand_dark: dark,
    brand_accent: accent,
    brand_font: font,
    style_notes: typeof parsed.style_notes === "string" ? parsed.style_notes.slice(0, 200) : "",
  };
}
