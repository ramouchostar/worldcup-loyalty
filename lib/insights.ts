// Moteur de suggestions commerciales (page Opportunités, admin).
// Fonctions PURES et déterministes — chaque suggestion est explicable par
// les chiffres qui l'ont produite (l'app propose, le restaurateur décide,
// même principe qu'ADR 0013/0017). Aucune donnée euro ne sort côté client :
// tout ceci est consommé par des surfaces admin uniquement (ADR 0007).

export const WEEKDAY_LABELS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

// Seuil minimal d'articles observés avant d'oser une suggestion — en
// dessous, le « jour creux » est du bruit statistique.
export const MIN_ITEMS_FOR_INSIGHTS = 30;

export type ProductStat = {
  id: string;
  name: string;
  menuPrice: number;
  costPrice: number;
  qty: number; // quantité vendue sur la période
};

// ─── Jour creux ───────────────────────────────────────────────────────────────

export type QuietDay = { day: number; qty: number; busiestDay: number; busiestQty: number };

// Jour de semaine le plus faible en volume, comparé au plus fort — on ne
// propose que si l'écart est net (creux < 50 % du pic).
export function findQuietDay(byWeekday: number[], totalItems: number): QuietDay | null {
  if (totalItems < MIN_ITEMS_FOR_INSIGHTS) return null;
  let min = 0;
  let max = 0;
  byWeekday.forEach((v, i) => {
    if (v < byWeekday[min]) min = i;
    if (v > byWeekday[max]) max = i;
  });
  if (byWeekday[max] === 0 || byWeekday[min] >= byWeekday[max] * 0.5) return null;
  return { day: min, qty: byWeekday[min], busiestDay: max, busiestQty: byWeekday[max] };
}

// ─── Heures creuses ───────────────────────────────────────────────────────────

export type QuietHours = { start: number; end: number; qty: number; windowQty: number };

// Fenêtre contiguë de 2 h la plus faible À L'INTÉRIEUR des heures
// d'ouverture observées (premières/dernières ventes) — pas la nuit fermée.
export function findQuietHours(byHour: number[], totalItems: number): QuietHours | null {
  if (totalItems < MIN_ITEMS_FOR_INSIGHTS) return null;
  const active = byHour.map((v, h) => ({ v, h })).filter((x) => x.v > 0);
  if (active.length === 0) return null;
  const open = active[0].h;
  const close = active[active.length - 1].h;
  if (close - open < 5) return null; // amplitude trop courte pour parler de creux

  let best: QuietHours | null = null;
  let peak = 0;
  for (let h = open; h <= close - 1; h++) {
    const qty = byHour[h] + byHour[h + 1];
    peak = Math.max(peak, qty);
    if (!best || qty < best.qty) best = { start: h, end: h + 2, qty, windowQty: 0 };
  }
  if (!best || peak === 0 || best.qty >= peak * 0.5) return null;
  best.windowQty = peak;
  return best;
}

// ─── Remise sûre ──────────────────────────────────────────────────────────────

// Remise maximale qui préserve au moins la moitié de la marge du plat —
// arrondie aux 5 %, bornée [10, 30]. Null si même 10 % mangerait trop.
export function safeDiscountPct(menuPrice: number, costPrice: number): number | null {
  const margin = menuPrice - costPrice;
  if (menuPrice <= 0 || margin <= 0) return null;
  const raw = (margin * 0.5) / menuPrice; // part du prix qu'on peut céder
  const pct = Math.min(30, Math.floor((raw * 100) / 5) * 5);
  return pct >= 10 ? pct : null;
}

// Meilleur plat à mettre en promo : marge € la plus forte parmi les plats
// qui se vendent déjà (la promo amplifie un plat prouvé, elle ne ressuscite
// pas un inconnu), avec une remise qui reste rentable.
export function pickPromoProduct(products: ProductStat[]): { product: ProductStat; discountPct: number } | null {
  const sold = products
    .filter((p) => p.qty > 0 && safeDiscountPct(p.menuPrice, p.costPrice) !== null)
    .sort((a, b) => (b.menuPrice - b.costPrice) - (a.menuPrice - a.costPrice));
  if (sold.length === 0) return null;
  const product = sold[0];
  return { product, discountPct: safeDiscountPct(product.menuPrice, product.costPrice)! };
}

// ─── Combos ───────────────────────────────────────────────────────────────────

export type ComboSuggestion = {
  kind: "co_occurrence" | "push_margin" | "raise_margin";
  a: ProductStat;
  b: ProductStat;
  timesTogether: number; // commandes où les deux apparaissent (0 si règle de marge)
  comboPrice: number;    // prix suggéré du combo
  saving: number;        // économie affichée au client
  comboMargin: number;   // marge restante du combo
  rationale: string;
};

const round50 = (n: number) => Math.round(n * 2) / 2; // arrondi aux 50 centimes

function buildCombo(
  kind: ComboSuggestion["kind"],
  a: ProductStat,
  b: ProductStat,
  timesTogether: number,
  rationale: string
): ComboSuggestion | null {
  const fullPrice = a.menuPrice + b.menuPrice;
  const fullMargin = a.menuPrice - a.costPrice + (b.menuPrice - b.costPrice);
  if (fullPrice <= 0 || fullMargin <= 0) return null;
  // Économie client : ~10 % du prix cumulé, plafonnée à la moitié de la
  // marge combinée — le combo reste toujours rentable.
  const saving = round50(Math.min(fullPrice * 0.1, fullMargin * 0.5));
  if (saving < 0.5) return null;
  return {
    kind,
    a,
    b,
    timesTogether,
    comboPrice: round50(fullPrice - saving),
    saving,
    comboMargin: fullMargin - saving,
    rationale,
  };
}

// Trois familles de combos, chacune expliquée par ses chiffres :
// 1. co_occurrence — déjà achetés ensemble : formaliser l'habitude.
// 2. push_margin — un best-seller entraîne un plat à forte marge qui se
//    vend peu (la marge du second finance l'économie).
// 3. raise_margin — un best-seller à faible marge est complété par un plat
//    à forte marge pour remonter la marge du panier.
export function suggestCombos(
  products: ProductStat[],
  pairCounts: Map<string, number>, // clé "idA|idB" triée
  totalItems: number
): ComboSuggestion[] {
  if (totalItems < MIN_ITEMS_FOR_INSIGHTS) return [];
  const byId = new Map(products.map((p) => [p.id, p]));
  const out: ComboSuggestion[] = [];
  const used = new Set<string>();
  const margin = (p: ProductStat) => p.menuPrice - p.costPrice;

  // 1. Paire la plus co-achetée (≥ 3 fois)
  const topPair = Array.from(pairCounts.entries()).sort((x, y) => y[1] - x[1])[0];
  if (topPair && topPair[1] >= 3) {
    const [idA, idB] = topPair[0].split("|");
    const a = byId.get(idA);
    const b = byId.get(idB);
    if (a && b) {
      const combo = buildCombo(
        "co_occurrence", a, b, topPair[1],
        `Déjà commandés ensemble ${topPair[1]} fois — formalise l'habitude et affiche l'économie.`
      );
      if (combo) {
        out.push(combo);
        used.add(a.id);
        used.add(b.id);
      }
    }
  }

  const sorted = [...products].sort((x, y) => y.qty - x.qty);
  const bestSellers = sorted.filter((p) => p.qty > 0).slice(0, 3);
  const medianMargin = [...products].map(margin).sort((x, y) => x - y)[Math.floor(products.length / 2)] ?? 0;

  // 2. Best-seller + forte marge qui se vend peu
  for (const bs of bestSellers) {
    if (out.length >= 3) break;
    const candidate = products
      .filter((p) => p.id !== bs.id && !used.has(p.id) && margin(p) > Math.max(medianMargin, 0) && p.qty < bs.qty * 0.3)
      .sort((x, y) => margin(y) - margin(x))[0];
    if (!candidate) continue;
    const combo = buildCombo(
      "push_margin", bs, candidate, 0,
      `« ${bs.name} » se vend fort (${bs.qty}×) et « ${candidate.name} » a une belle marge mais ne sort presque pas (${candidate.qty}×) — le premier tire le second.`
    );
    if (combo) {
      out.push(combo);
      used.add(bs.id);
      used.add(candidate.id);
    }
  }

  // 3. Best-seller à faible marge + complément à forte marge
  if (out.length < 3) {
    const lowMarginSeller = bestSellers.find((p) => !used.has(p.id) && margin(p) <= medianMargin);
    if (lowMarginSeller) {
      const complement = products
        .filter((p) => p.id !== lowMarginSeller.id && !used.has(p.id) && margin(p) > medianMargin)
        .sort((x, y) => margin(y) - margin(x))[0];
      if (complement) {
        const combo = buildCombo(
          "raise_margin", lowMarginSeller, complement, 0,
          `« ${lowMarginSeller.name} » se vend bien mais rapporte peu — l'associer à « ${complement.name} » remonte la marge de chaque panier.`
        );
        if (combo) out.push(combo);
      }
    }
  }

  return out.slice(0, 3);
}

// ─── Formule dégressive (stratégie terrain, ADR 0022) ────────────────────────

// Première stratégie terrain encodée : sur un article à FORTE VALEUR PERÇUE
// (prix carte élevé pour un coût matière faible), proposer une échelle
// dégressive « 1 pour €7 · 2 pour €10 · 3 pour €12 » qui pousse le client à
// monter en gamme. Constat de terrain : plus la valeur perçue est haute, plus
// le client est sensible à la promo — la remise porte sur le prix perçu, pas
// sur la marge, qui reste protégée unité par unité.

// Valeur perçue forte : prix carte ≥ 3× le coût matière.
export const BUNDLE_MIN_RATIO = 3;
// Chaque unité supplémentaire vendue doit rapporter au moins ça de marge —
// jamais d'unité vendue à prix coûtant pour gonfler l'échelle.
export const BUNDLE_MIN_MARGINAL_MARGIN = 0.5;

// Prix marginal des 2e, 3e et 4e unités, en fraction du prix carte —
// calibré sur l'échelle de référence (unité €7 → 2/€10 · 3/€12 · 4/€13+).
const BUNDLE_MARGINAL_FRACTIONS = [0.45, 0.3, 0.15] as const;

const ceil50 = (n: number) => Math.ceil(n * 2) / 2;

export type BundleTier = {
  units: number;
  price: number;          // prix total de la formule
  saving: number;         // économie affichée vs prix unitaire × unités
  margin: number;         // marge totale restante de la formule
  marginalPrice: number;  // ce que la dernière unité coûte au client
  marginalMargin: number; // ce qu'elle rapporte encore au restaurant
};

export type BundleSuggestion = { product: ProductStat; tiers: BundleTier[] };

// Échelle dégressive pour un article donné. Le prix marginal de chaque unité
// ajoutée suit les fractions de calibrage mais est relevé si nécessaire pour
// préserver la marge minimale — la dernière unité n'est jamais un cadeau.
export function buildBundleLadder(product: ProductStat): BundleTier[] {
  const { menuPrice, costPrice } = product;
  if (menuPrice <= 0 || costPrice <= 0 || menuPrice - costPrice <= BUNDLE_MIN_MARGINAL_MARGIN) return [];
  const tiers: BundleTier[] = [];
  let price = menuPrice;
  for (let k = 2; k <= 4; k++) {
    const target = round50(menuPrice * BUNDLE_MARGINAL_FRACTIONS[k - 2]);
    const floor = ceil50(costPrice + BUNDLE_MIN_MARGINAL_MARGIN);
    const marginal = Math.max(target, floor);
    if (marginal >= menuPrice) break; // plus aucune dégressivité possible
    price += marginal;
    tiers.push({
      units: k,
      price,
      saving: k * menuPrice - price,
      margin: price - k * costPrice,
      marginalPrice: marginal,
      marginalMargin: marginal - costPrice,
    });
  }
  return tiers;
}

// Article cible : le mieux vendu parmi ceux à forte valeur perçue (ratio
// prix/coût ≥ 3) — la formule amplifie un produit prouvé, comme la promo.
export function suggestDegressiveBundle(
  products: ProductStat[],
  totalItems: number
): BundleSuggestion | null {
  if (totalItems < MIN_ITEMS_FOR_INSIGHTS) return null;
  const candidates = products
    .filter((p) => p.qty > 0 && p.costPrice > 0 && p.menuPrice / p.costPrice >= BUNDLE_MIN_RATIO)
    .sort((a, b) => b.qty - a.qty || b.menuPrice / b.costPrice - a.menuPrice / a.costPrice);
  for (const product of candidates) {
    const tiers = buildBundleLadder(product);
    if (tiers.length >= 2) return { product, tiers };
  }
  return null;
}

// Clé canonique d'une paire de produits (ordre stable)
export function pairKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
}
