// ADR 0069 §3 C — les concurrents : qui est autour, qui est LE concurrent à
// battre, ce que ses clients lui reprochent, et comment lui prendre des clients.
// Plus la grille de positionnement local : à quel rang Google Maps montre le
// restaurant quand on cherche sa spécialité depuis les rues autour.
//
// Fonctions pures (testées) + une orchestration qui appelle DataForSEO (Maps,
// avis du concurrent) et Claude (thèmes du concurrent, plan d'attaque).

import { claudeJson } from "./claude-json";
import { mapsSearch, getReviews, postReviewsTask, type MapsResult } from "./dataforseo";
import { analyseThemes, type ReviewThemes, type ThemeOut } from "./review-themes";
import type { CompetitivePosition, FicheGap, Level } from "./signals";

// ─── Recherche : quel mot un client tape-t-il pour trouver ce restaurant ? ───

const KEYWORDS: [RegExp, string][] = [
  [/burger|hamburger/i, "burger"],
  [/pizz/i, "pizza"],
  [/sushi|japonais/i, "sushi"],
  [/kebab|d[öo]ner|pita/i, "kebab"],
  [/poulet|chicken/i, "poulet frit"],
  [/tacos/i, "tacos"],
  [/libanais/i, "restaurant libanais"],
  [/italien/i, "restaurant italien"],
  [/indien/i, "restaurant indien"],
  [/chinois/i, "restaurant chinois"],
  [/tha[iï]/i, "restaurant thaï"],
  [/marocain/i, "restaurant marocain"],
  [/turc/i, "restaurant turc"],
  [/grill|grillade/i, "grill"],
  [/friterie|frites/i, "friterie"],
  [/brunch/i, "brunch"],
  [/boulangerie/i, "boulangerie"],
  [/snack|sandwich/i, "snack"],
  [/restauration rapide|fast/i, "fast food"],
];

/** Le mot-clé de recherche principal, tiré de la catégorie puis des catégories secondaires. */
export function searchKeyword(category: string | null, additional: string[] | null, name: string | null = null): string {
  for (const c of [category, ...(additional ?? []), name]) {
    if (!c) continue;
    for (const [re, kw] of KEYWORDS) if (re.test(c)) return kw;
  }
  return "restaurant";
}

// ─── Géographie ──────────────────────────────────────────────────────────────

export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export const GRID_STEP_M = 700;

/** 3 × 3 points autour du restaurant, espacés de 700 m (le centre = le restaurant). */
export function gridPoints(lat: number, lng: number, step = GRID_STEP_M): { row: number; col: number; lat: number; lng: number }[] {
  const dLat = step / 111320;
  const dLng = step / (111320 * Math.cos((lat * Math.PI) / 180));
  const out = [];
  for (let row = -1; row <= 1; row++) for (let col = -1; col <= 1; col++) out.push({ row, col, lat: lat - row * dLat, lng: lng + col * dLng });
  return out;
}

// ─── Concurrents et concurrent principal ────────────────────────────────────

export interface Competitor extends MapsResult {
  distance: number | null;
}

export const COMPETITOR_RADIUS_M = 2000;
export const MAX_COMPETITORS = 8;

const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

export function nearbyCompetitors(items: MapsResult[], self: { cid: string | null; lat: number; lng: number; title?: string | null }): Competitor[] {
  const seen = new Set<string>();
  const selfTitle = self.title ? norm(self.title) : null;
  return items
    .filter((i) => i.cid && i.cid !== self.cid && !seen.has(i.cid) && (seen.add(i.cid), true))
    .map((i) => ({ ...i, distance: i.latitude != null && i.longitude != null ? distanceM(self, { lat: i.latitude, lng: i.longitude }) : null }))
    .filter((i) => i.distance == null || i.distance <= COMPETITOR_RADIUS_M)
    // Doublon de sa propre fiche (constaté : « Taste matters » à 16 m de
    // « Belchicken Kraainem | Taste Matters », sans avis) : pas un concurrent.
    .filter((i) => !(selfTitle && norm(i.title).length > 3 && selfTitle.includes(norm(i.title))))
    .filter((i) => !((i.distance ?? Infinity) < 40 && !i.reviews))
    .slice(0, MAX_COMPETITORS);
}

// Enseignes connues : un client les choisit « par défaut », ce sont les
// clients les plus faciles à faire changer d'habitude (exemple du porteur :
// le Quick de Kraainem face à Belchicken).
const BRANDS = /\b(quick|mc ?donald'?s|burger king|kfc|pizza hut|domino'?s|subway|five guys|o'?tacos|exki|panos|nordsee|belchicken|black ?& ?white burger|manhattn'?s|ellis gourmet|balls ?& ?glory|otomat)\b/i;

export function isKnownBrand(name: string): boolean {
  return BRANDS.test(name);
}

/**
 * Le concurrent à battre : proche, beaucoup d'avis (= beaucoup de clients),
 * et bonus pour une enseigne connue. Poids = ln(1 + avis) ÷ (1 + distance / 500 m) × 1,5 si enseigne.
 */
export function mainRival(competitors: Competitor[]): Competitor | null {
  let best: { c: Competitor; w: number } | null = null;
  for (const c of competitors) {
    const w = (Math.log(1 + (c.reviews ?? 0)) / (1 + (c.distance ?? 1000) / 500)) * (isKnownBrand(c.title) ? 1.5 : 1);
    if (!best || w > best.w) best = { c, w };
  }
  return best?.c ?? null;
}

// ─── Score « face aux voisins » et signaux ──────────────────────────────────

const median = (xs: number[]) => {
  const v = [...xs].sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export interface GridCell {
  row: number;
  col: number;
  /** Rang du restaurant dans Google Maps depuis ce point ; null = absent du top 20. */
  rank: number | null;
  /** Les 3 premiers que le client voit depuis ce point (audits depuis le 2026-09-26). */
  leaders?: { cid: string | null; title: string; rank: number }[];
}

export interface NeighborsScore {
  score: number;
  parts: { note: number; volume: number; rang: number; photos: number };
  medianRating: number | null;
  medianReviews: number | null;
  medianPhotos: number | null;
  averageRank: number | null;
}

export function neighborsScore(self: { rating: number | null; reviews: number | null; photos: number | null }, competitors: Competitor[], grid: GridCell[]): NeighborsScore {
  const mr = median(competitors.map((c) => c.rating).filter((x): x is number => x != null));
  const mv = median(competitors.map((c) => c.reviews).filter((x): x is number => x != null));
  const mp = median(competitors.map((c) => c.totalPhotos).filter((x): x is number => x != null));
  const note = self.rating != null && mr != null ? clamp01((self.rating - mr + 0.5) / 1) * 30 : 0;
  const volume = self.reviews != null && mv ? clamp01(self.reviews / (mv * 1.5)) * 25 : 0;
  const rangs = grid.map((g) => (g.rank == null ? 0 : clamp01((21 - g.rank) / 20)));
  const rang = rangs.length ? (rangs.reduce((a, b) => a + b, 0) / rangs.length) * 30 : 0;
  const photos = self.photos != null && mp ? clamp01(self.photos / mp) * 15 : 0;
  const ranked = grid.map((g) => g.rank).filter((r): r is number => r != null);
  return {
    score: Math.round(note + volume + rang + photos),
    parts: { note: Math.round(note), volume: Math.round(volume), rang: Math.round(rang), photos: Math.round(photos) },
    medianRating: mr,
    medianReviews: mv,
    medianPhotos: mp,
    averageRank: ranked.length ? Math.round((ranked.reduce((a, b) => a + b, 0) / ranked.length) * 10) / 10 : null,
  };
}

export function positionSignal(ourRating: number | null, medianRating: number | null): CompetitivePosition | null {
  if (ourRating == null || medianRating == null) return null;
  const d = ourRating - medianRating;
  return d <= -0.2 ? "derriere" : d >= 0.2 ? "devant" : "au_niveau";
}

export function volumeSignal(ourReviews: number | null, medianReviews: number | null): Level | null {
  if (ourReviews == null || !medianReviews) return null;
  const r = ourReviews / medianReviews;
  return r < 0.5 ? "faible" : r < 1.5 ? "moyen" : "fort";
}

/** Manques de la fiche que la majorité des voisins ont, eux, comblés (lisibles dans Maps). */
export function gapsCovered(competitors: Competitor[], ourPhotos: number | null): FicheGap[] {
  if (!competitors.length) return [];
  const share = (f: (c: Competitor) => boolean) => competitors.filter(f).length / competitors.length;
  const out: FicheGap[] = [];
  if (share((c) => c.hasOrderButton) >= 0.5) out.push("pas_de_lien_commande");
  if (share((c) => c.hasWebsite) >= 0.5) out.push("pas_de_site");
  const mp = median(competitors.map((c) => c.totalPhotos).filter((x): x is number => x != null));
  if (mp != null && ourPhotos != null && mp > ourPhotos * 1.5) out.push("photos_peu_nombreuses");
  return out;
}

// ─── Plan d'attaque face au concurrent principal (Claude) ───────────────────

export interface AttackAction {
  title: string;
  why: string;
  steps: string[];
}

const ATTACK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["actions"],
  properties: {
    actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "why", "steps"],
        properties: { title: { type: "string" }, why: { type: "string" }, steps: { type: "array", items: { type: "string" } } },
      },
    },
  },
};

function fmtThemes(ts: ThemeOut[]) {
  return ts.map((t) => `- ${t.label} (${t.count} avis)`).join("\n") || "- (aucun)";
}

export async function attackPlan(input: {
  ours: { name: string; rating: number | null; reviews: number | null; photos: number | null; hasOrderButton: boolean; themes: ReviewThemes | null };
  rival: Competitor;
  rivalThemes: ReviewThemes | null;
}): Promise<{ actions: AttackAction[]; tokens: { input: number; output: number } }> {
  const o = input.ours;
  const r = input.rival;
  const facts = `NOUS : ${o.name} — ${o.rating ?? "?"}★, ${o.reviews ?? "?"} avis, ${o.photos ?? "?"} photos, bouton Commander : ${o.hasOrderButton ? "oui" : "non"}.
Nos points forts selon nos clients :
${fmtThemes(o.themes?.positives ?? [])}
Nos points faibles selon nos clients :
${fmtThemes(o.themes?.negatives ?? [])}

CONCURRENT PRINCIPAL : ${r.title} (${r.category ?? "?"}) à ${r.distance ?? "?"} m — ${r.rating ?? "?"}★, ${r.reviews ?? "?"} avis, ${r.totalPhotos ?? "?"} photos, bouton Commander : ${r.hasOrderButton ? "oui" : "non"}${isKnownBrand(r.title) ? ", enseigne connue" : ""}.
Ce que ses clients lui reprochent :
${fmtThemes(input.rivalThemes?.negatives ?? [])}
Ce que ses clients aiment :
${fmtThemes(input.rivalThemes?.positives ?? [])}`;

  const { data: parsed, tokens } = await claudeJson<{ actions?: AttackAction[] }>({
    prompt: `Tu conseilles un restaurant bruxellois qui veut prendre des clients à son concurrent le plus proche. Faits (ne rien inventer au-delà) :

${facts}

Propose 3 à 5 actions concrètes, en français, pour attirer les clients de ce concurrent. Chaque action s'appuie sur UN fait ci-dessus (un reproche fait au concurrent que nous faisons mieux, un point fort à mettre en avant, un manque de notre fiche face à la sienne). Pas de conseil générique. Pour chacune :
- title : 4 à 9 mots, à l'impératif
- why : le fait qui justifie l'action, avec le chiffre (une phrase)
- steps : 2 ou 3 gestes précis que le gérant peut faire cette semaine

Pour récolter des avis Google, ne propose pas de QR code ni de carte à fabriquer : c'est Boosteats, l'outil que nous lui présentons, qui s'en charge. Écris ce geste exactement ainsi : « Encourager vos clients à laisser un avis avec Boosteats ».`,
    schema: ATTACK_SCHEMA,
    maxTokens: 16000,
  });
  const actions = (parsed.actions ?? [])
    .filter((a) => a && a.title && a.why)
    .slice(0, 5)
    .map((a) => ({ title: String(a.title).slice(0, 120), why: String(a.why).slice(0, 300), steps: (a.steps ?? []).map((x) => String(x).slice(0, 300)).slice(0, 3) }));
  return { actions, tokens };
}

// ─── Orchestration ──────────────────────────────────────────────────────────

export interface CompetitorsResult {
  keyword: string;
  competitors: Competitor[];
  rival: Competitor | null;
  rivalThemes: ReviewThemes | null;
  rivalError: string | null;
  attack: AttackAction[];
  attackError: string | null;
  grid: GridCell[];
  score: NeighborsScore;
  position: CompetitivePosition | null;
  reviewVolume: Level | null;
  gapsCovered: FicheGap[];
}

const RIVAL_REVIEWS_DEPTH = 100;

/**
 * En deux temps pour tenir dans la durée d'une fonction : `scanNeighbors`
 * (grille, concurrents, avis et thèmes du concurrent principal) tourne EN MÊME
 * TEMPS que la lecture de nos propres avis ; `finishCompetitors` (plan
 * d'attaque, qui a besoin de nos thèmes) vient après.
 */
export async function scanNeighbors(input: { cid: string | null; name: string; category: string | null; additionalCategories: string[] | null; lat: number; lng: number; calls: Record<string, number> }) {
  const keyword = searchKeyword(input.category, input.additionalCategories, input.name);
  let cost = 0;
  const points = gridPoints(input.lat, input.lng);
  const searches = await Promise.all(points.map((p) => mapsSearch(keyword, p.lat, p.lng)));
  input.calls.dataforseo = (input.calls.dataforseo ?? 0) + searches.length;
  cost += searches.reduce((a, s) => a + s.cost, 0);
  const grid: GridCell[] = points.map((p, i) => {
    const hit = searches[i].items.find((it) => it.cid && it.cid === input.cid);
    const leaders = searches[i].items
      .filter((it) => !(it.cid && it.cid === input.cid))
      .slice(0, 3)
      .map((it) => ({ cid: it.cid, title: it.title, rank: it.rank }));
    return { row: p.row, col: p.col, rank: hit ? hit.rank : null, leaders };
  });
  const center = searches[points.findIndex((p) => p.row === 0 && p.col === 0)];
  const competitors = nearbyCompetitors(center.items, { cid: input.cid, lat: input.lat, lng: input.lng, title: input.name });
  const rival = mainRival(competitors);

  let rivalThemes: ReviewThemes | null = null;
  let rivalError: string | null = null;
  if (rival?.cid) {
    try {
      const id = await postReviewsTask({ cid: rival.cid }, RIVAL_REVIEWS_DEPTH);
      input.calls.dataforseo += 1;
      cost += id.cost;
      const start = Date.now();
      let reviews = null;
      while (!reviews && Date.now() - start < 3 * 60_000) {
        await new Promise((r) => setTimeout(r, 5_000));
        input.calls.dataforseo += 1;
        const res = await getReviews(id.id);
        if (res.ready) reviews = res;
      }
      if (!reviews) throw new Error("Avis du concurrent toujours en attente après 3 min.");
      cost += reviews.cost;
      rivalThemes = await analyseThemes({ name: rival.title, category: rival.category, reviews: reviews.reviews, topics: null });
      input.calls.claude_tokens_in = (input.calls.claude_tokens_in ?? 0) + rivalThemes.tokens.input;
      input.calls.claude_tokens_out = (input.calls.claude_tokens_out ?? 0) + rivalThemes.tokens.output;
    } catch (e) {
      rivalError = e instanceof Error ? e.message : String(e);
    }
  }
  return { keyword, grid, competitors, rival, rivalThemes, rivalError, cost };
}

export async function finishCompetitors(
  scan: Awaited<ReturnType<typeof scanNeighbors>>,
  ours: { name: string; rating: number | null; reviews: number | null; photos: number | null; hasOrderButton: boolean; themes: ReviewThemes | null },
  calls: Record<string, number>,
): Promise<CompetitorsResult> {
  let attack: AttackAction[] = [];
  let attackError: string | null = null;
  if (scan.rival) {
    try {
      const plan = await attackPlan({ ours, rival: scan.rival, rivalThemes: scan.rivalThemes });
      attack = plan.actions;
      calls.claude_tokens_in = (calls.claude_tokens_in ?? 0) + plan.tokens.input;
      calls.claude_tokens_out = (calls.claude_tokens_out ?? 0) + plan.tokens.output;
    } catch (e) {
      attackError = e instanceof Error ? e.message : String(e);
    }
  }
  const score = neighborsScore({ rating: ours.rating, reviews: ours.reviews, photos: ours.photos }, scan.competitors, scan.grid);
  return {
    keyword: scan.keyword,
    competitors: scan.competitors,
    rival: scan.rival,
    rivalThemes: scan.rivalThemes,
    rivalError: scan.rivalError,
    attack,
    attackError,
    grid: scan.grid,
    score,
    position: positionSignal(ours.rating, score.medianRating),
    reviewVolume: volumeSignal(ours.reviews, score.medianReviews),
    gapsCovered: gapsCovered(scan.competitors, ours.photos),
  };
}

