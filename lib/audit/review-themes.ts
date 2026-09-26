// ADR 0069 §3 D — les thèmes des avis : ce qui revient en négatif (à régler)
// et en positif (à capitaliser). SERVEUR UNIQUEMENT.
//
// Partage des rôles, pour que les chiffres soient vrais :
//  - Claude lit les avis numérotés, propose les thèmes et dit QUELS avis
//    parlent de quel thème (des numéros, pas des comptes) ;
//  - ce module compte lui-même, calcule les parts et choisit la citation
//    d'exemple dans le texte réel de l'avis (jamais une phrase reformulée) ;
//  - Claude écrit la solution d'un thème négatif seulement si elle n'est pas
//    évidente, et comment capitaliser sur un thème positif.
// Les mots-clés de Google (place_topics) reçoivent un sens (positif / négatif /
// neutre) et, pour les négatifs, une explication.

import { AUDIT_MODEL, claudeJson, nullable } from "./claude-json";
import type { StoredReview } from "./dataforseo";
import { NEGATIVE_THEMES, type NegativeTheme } from "./signals";

export const THEMES_MODEL = AUDIT_MODEL;
const MAX_REVIEWS = 400;
const MAX_CHARS = 320;
/** Un thème négatif compte pour le moteur s'il touche au moins 8 % des avis 1–3★. */
export const NEGATIVE_SHARE_MIN = 0.08;

export interface ThemeOut {
  key: string;
  label: string;
  /** Pour les négatifs : le thème du moteur de scénarios, ou null si hors liste. */
  engineTheme: NegativeTheme | null;
  count: number;
  /** Part des avis concernés (1–3★ pour les négatifs, 4–5★ pour les positifs). */
  share: number;
  /** Mentions dans les 6 derniers mois, pour dire si ça monte. */
  recent: number;
  example: string | null;
  /** Négatif : comment le régler (null = évident). Positif : comment capitaliser. */
  advice: string | null;
}

export interface TopicSentiment {
  keyword: string;
  count: number;
  sentiment: "positif" | "negatif" | "neutre";
  detail: string | null;
}

export interface ReviewThemes {
  negatives: ThemeOut[];
  positives: ThemeOut[];
  topics: TopicSentiment[];
  /** Clientèle déduite des avis, en une phrase (sert aux concurrents et au plan). */
  audience: string | null;
  analysed: number;
  tokens: { input: number; output: number };
}

type ModelTheme = { key: string; label: string; engine_theme?: string | null; reviews: number[]; advice?: string | null };
type ModelOut = {
  negatives?: ModelTheme[];
  positives?: ModelTheme[];
  topics?: { keyword: string; sentiment: string; detail?: string | null }[];
  audience?: string | null;
};

function prompt(name: string, category: string | null, lines: string, topics: string[]): string {
  return `Tu es consultant pour restaurants à Bruxelles. Voici des avis Google de « ${name} »${category ? ` (${category})` : ""}, numérotés, avec leur note.

${lines}

Mots-clés que Google a repérés dans ces avis : ${topics.length ? topics.join(", ") : "(aucun)"}.

Travail demandé, en français :
1. negatives : 3 à 6 thèmes négatifs qui REVIENNENT (pas un avis isolé). Pour chacun :
   - key : identifiant court en minuscules (ex. "attente_midi")
   - label : 3 à 6 mots, précis et concret (ex. "Attente trop longue le midi", pas "Service")
   - engine_theme : le plus proche parmi ${NEGATIVE_THEMES.join(", ")} — ou null si aucun ne correspond
   - reviews : les NUMÉROS de TOUS les avis qui en parlent
   - advice : la solution concrète et précise pour CE restaurant, en une ou deux phrases à l'impératif ; null si la solution est évidente (ex. « nettoyer »)
2. positives : 3 à 6 thèmes positifs qui reviennent, mêmes champs (sans engine_theme). advice = comment capitaliser dessus : où le mettre en avant (fiche Google, photos, description, réseaux, réponses aux avis), en une ou deux phrases.
3. topics : pour CHAQUE mot-clé de Google ci-dessus, sentiment "positif", "negatif" ou "neutre" tel que les clients l'emploient ; pour les négatifs, detail = ce que les clients reprochent, en une phrase.
4. audience : la clientèle qui ressort des avis, en une phrase (âge, occasion, moment).

N'invente rien : un thème doit s'appuyer sur les avis cités.`;
}

const THEME_SCHEMA = (withEngine: boolean) => ({
  type: "object",
  additionalProperties: false,
  required: withEngine ? ["key", "label", "engine_theme", "reviews", "advice"] : ["key", "label", "reviews", "advice"],
  properties: {
    key: { type: "string" },
    label: { type: "string" },
    ...(withEngine ? { engine_theme: nullable({ type: "string", enum: [...NEGATIVE_THEMES] }) } : {}),
    reviews: { type: "array", items: { type: "integer" } },
    advice: nullable({ type: "string" }),
  },
});

/** Le schéma de la réponse : la sortie structurée garantit un JSON complet et valide. */
export const THEMES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["negatives", "positives", "topics", "audience"],
  properties: {
    negatives: { type: "array", items: THEME_SCHEMA(true) },
    positives: { type: "array", items: THEME_SCHEMA(false) },
    topics: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["keyword", "sentiment", "detail"],
        properties: {
          keyword: { type: "string" },
          sentiment: { type: "string", enum: ["positif", "negatif", "neutre"] },
          detail: nullable({ type: "string" }),
        },
      },
    },
    audience: nullable({ type: "string" }),
  },
};

/** Extrait de l'avis réel, autour de la première phrase utile. */
export function excerpt(text: string, max = 140): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return lastStop > 60 ? cut.slice(0, lastStop + 1) : cut.slice(0, cut.lastIndexOf(" ")).trimEnd() + "…";
}

/** Compte, parts, récence et citation : calculés ici, à partir des numéros donnés par le modèle. */
export function tally(
  themes: ModelTheme[] | undefined,
  numbered: StoredReview[],
  side: "negatif" | "positif",
  now = new Date(),
): ThemeOut[] {
  const pool = numbered.filter((r) => r.rating != null && (side === "negatif" ? r.rating <= 3 : r.rating >= 4)).length;
  const since = new Date(now.getTime() - 182 * 864e5).toISOString();
  return (themes ?? [])
    .map((t) => {
      const idx = [...new Set((t.reviews ?? []).filter((n) => Number.isInteger(n) && n >= 1 && n <= numbered.length))];
      const rs = idx.map((n) => numbered[n - 1]).filter((r) => r.rating != null && (side === "negatif" ? r.rating <= 3 : r.rating >= 4));
      // Exemple : l'avis le plus récent de longueur raisonnable.
      const ex = [...rs].filter((r) => r.text && r.text.length >= 25).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))[0];
      const engine = side === "negatif" && t.engine_theme && (NEGATIVE_THEMES as readonly string[]).includes(t.engine_theme) ? (t.engine_theme as NegativeTheme) : null;
      return {
        key: String(t.key).slice(0, 40),
        label: String(t.label).slice(0, 80),
        engineTheme: engine,
        count: rs.length,
        share: pool ? Math.round((rs.length / pool) * 100) / 100 : 0,
        recent: rs.filter((r) => (r.date ?? "") >= since).length,
        example: ex?.text ? excerpt(ex.text) : null,
        advice: t.advice ? String(t.advice).slice(0, 400) : null,
      };
    })
    .filter((t) => t.count >= 2)
    .sort((a, b) => b.count - a.count);
}

/** Thèmes du moteur de scénarios, du plus au moins cité (≥ 8 % des avis 1–3★). */
export function engineThemes(negatives: ThemeOut[]): NegativeTheme[] {
  const out: NegativeTheme[] = [];
  for (const t of negatives) if (t.engineTheme && t.share >= NEGATIVE_SHARE_MIN && !out.includes(t.engineTheme)) out.push(t.engineTheme);
  return out;
}

export function isThemesConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export async function analyseThemes(input: {
  name: string;
  category: string | null;
  reviews: StoredReview[];
  topics: Record<string, number> | null;
}): Promise<ReviewThemes> {
  const numbered = input.reviews
    .filter((r) => r.text && r.text.trim().length >= 10)
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, MAX_REVIEWS);
  const lines = numbered.map((r, i) => `${i + 1}. [${r.rating ?? "?"}★] ${r.text!.replace(/\s+/g, " ").slice(0, MAX_CHARS)}`).join("\n");
  const topicWords = Object.keys(input.topics ?? {});

  const { data: parsed, tokens } = await claudeJson<ModelOut>({
    prompt: prompt(input.name, input.category, lines, topicWords),
    schema: THEMES_SCHEMA,
  });

  const sentiments = new Map((parsed.topics ?? []).map((t) => [t.keyword.toLowerCase(), t]));
  const topics: TopicSentiment[] = Object.entries(input.topics ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([keyword, count]) => {
      const t = sentiments.get(keyword.toLowerCase());
      const sentiment = t?.sentiment === "positif" || t?.sentiment === "negatif" ? t.sentiment : "neutre";
      return { keyword, count, sentiment, detail: sentiment === "negatif" && t?.detail ? String(t.detail).slice(0, 240) : null };
    });

  return {
    negatives: tally(parsed.negatives, numbered, "negatif"),
    positives: tally(parsed.positives, numbered, "positif"),
    topics,
    audience: parsed.audience ? String(parsed.audience).slice(0, 240) : null,
    analysed: numbered.length,
    tokens,
  };
}
