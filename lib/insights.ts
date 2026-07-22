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

// ─── « N achetés = 1 offert » pour le jour creux (stratégie terrain, ADR 0022) ─

// Deuxième stratégie terrain : sur un jour creux, offrir une unité gratuite à
// l'achat de N unités payées. La valeur perçue de l'offre est le PRIX CARTE de
// l'unité offerte (le client voit « €12 offerts ») ; son coût réel n'est que
// le coût matière. N se déduit du ratio coût/prix du produit : un burger à
// €12 pour €1,50 de coût supporte « 1 acheté = 1 offert », une pizza dont le
// coût fait 25 % du prix exige « 3 achetées = la 4e offerte » — dans les deux
// cas la formule complète garde une marge saine, c'est le curseur.

// Marge minimale de la formule complète (N payées + 1 offerte), calibrée sur
// les deux exemples de référence : burger 1+1 → 75 %, pizza 3+1 → 66,7 % ;
// pizza 2+1 tomberait à 62,5 % → rejetée, il faut bien 3 payées.
export const FREEBIE_MIN_MARGIN_RATIO = 0.65;
// Au-delà de 4 unités payées, l'offre n'attire plus personne.
export const FREEBIE_MAX_PAID_UNITS = 4;

export type FreebieSuggestion = {
  product: ProductStat;
  paidUnits: number;      // N unités payées pour 1 offerte
  revenue: number;        // encaissé par formule (N × prix carte)
  totalCost: number;      // coût matière des N+1 unités
  margin: number;         // marge restante par formule
  marginRatio: number;    // marge / encaissé
  perceivedValue: number; // ce que le client croit gagner (prix carte de l'offerte)
  realCost: number;       // ce que l'offerte coûte vraiment (coût matière)
};

// Plus petit N (1..4) tel que la formule N payées + 1 offerte garde la marge
// minimale. Null si même 4 payées n'y suffisent pas (coût trop lourd).
export function freebiePaidUnits(menuPrice: number, costPrice: number): number | null {
  if (menuPrice <= 0 || costPrice <= 0) return null;
  for (let n = 1; n <= FREEBIE_MAX_PAID_UNITS; n++) {
    const marginRatio = (n * menuPrice - (n + 1) * costPrice) / (n * menuPrice);
    if (marginRatio >= FREEBIE_MIN_MARGIN_RATIO) return n;
  }
  return null;
}

// Produit cible : parmi les articles qui se vendent déjà, celui dont l'offre
// est la plus percutante — N le plus petit d'abord (« 1 acheté = 1 offert »
// bat « 3 achetés = 1 offert »), puis la valeur perçue de l'unité offerte
// (prix carte), puis le volume prouvé.
export function suggestBuyNGetOneFree(
  products: ProductStat[],
  totalItems: number
): FreebieSuggestion | null {
  if (totalItems < MIN_ITEMS_FOR_INSIGHTS) return null;
  let best: { n: number; p: ProductStat } | null = null;
  for (const p of products) {
    if (p.qty <= 0) continue;
    const n = freebiePaidUnits(p.menuPrice, p.costPrice);
    if (n === null) continue;
    if (
      !best ||
      n < best.n ||
      (n === best.n && p.menuPrice > best.p.menuPrice) ||
      (n === best.n && p.menuPrice === best.p.menuPrice && p.qty > best.p.qty)
    ) {
      best = { n, p };
    }
  }
  if (!best) return null;
  const { n, p } = best;
  const revenue = n * p.menuPrice;
  const totalCost = (n + 1) * p.costPrice;
  return {
    product: p,
    paidUnits: n,
    revenue,
    totalCost,
    margin: revenue - totalCost,
    marginRatio: (revenue - totalCost) / revenue,
    perceivedValue: p.menuPrice,
    realCost: p.costPrice,
  };
}

// ─── Arrondir le ticket du jour de rush (stratégie terrain, ADR 0022) ────────

// Troisième stratégie terrain : un jour de rush, le restaurant travaille déjà
// à plein — inutile d'y chercher plus de commandes, on fait grossir le PANIER
// MOYEN. Dès qu'un ticket atteint le panier moyen (ex. €30), proposer un
// accompagnement à partager en « 1 acheté = 1 offert » : la portion offerte
// est perçue à son prix carte (€4,50) mais ne coûte que son coût matière
// (€0,45) — le ticket passe de €30 à €34,50 et la marge monte d'autant.

// Un accompagnement « à coût très bas » : coût matière ≤ 15 % du prix carte
// (frites larges €4,50 / €0,45 = 10 % ; un plat à 25-30 % de coût est exclu).
export const RUSH_SIDE_MAX_COST_RATIO = 0.15;
// Un accompagnement, pas un plat : prix carte ≤ 25 % du seuil de ticket.
export const RUSH_SIDE_MAX_PRICE_RATIO = 0.25;

export type RushDay = { day: number; qty: number; othersAvg: number };

// Jour le plus chargé, s'il se détache nettement des autres (≥ +25 % vs la
// moyenne des six autres jours).
export function findRushDay(byWeekday: number[], totalItems: number): RushDay | null {
  if (totalItems < MIN_ITEMS_FOR_INSIGHTS) return null;
  let max = 0;
  byWeekday.forEach((v, i) => {
    if (v > byWeekday[max]) max = i;
  });
  const others = byWeekday.filter((_, i) => i !== max);
  const othersAvg = others.reduce((s, v) => s + v, 0) / others.length;
  if (byWeekday[max] === 0 || byWeekday[max] < othersAvg * 1.25) return null;
  return { day: max, qty: byWeekday[max], othersAvg };
}

export type RushUpsellSuggestion = {
  product: ProductStat;
  threshold: number;  // le ticket doit atteindre ce montant (panier moyen arrondi aux €5)
  newBasket: number;  // ticket après l'offre (seuil + prix de la portion payée)
  basketGain: number; // ce que le ticket gagne (prix carte de la portion payée)
  realCost: number;   // coût matière des deux portions (payée + offerte)
  marginGain: number; // marge supplémentaire par ticket qui joue le jeu
};

// Accompagnement cible : parmi les articles prouvés à coût très bas et à prix
// d'accompagnement, celui qui fait grossir la marge du ticket le plus fort —
// à gain égal, le plus vendu (une envie déjà prouvée se propose mieux).
export function suggestRushUpsell(
  products: ProductStat[],
  avgBasket: number,
  totalItems: number
): RushUpsellSuggestion | null {
  if (totalItems < MIN_ITEMS_FOR_INSIGHTS || avgBasket <= 0) return null;
  const threshold = Math.max(10, Math.round(avgBasket / 5) * 5);
  let best: ProductStat | null = null;
  for (const p of products) {
    if (p.qty <= 0 || p.costPrice <= 0 || p.menuPrice <= 0) continue;
    if (p.costPrice / p.menuPrice > RUSH_SIDE_MAX_COST_RATIO) continue;
    if (p.menuPrice > threshold * RUSH_SIDE_MAX_PRICE_RATIO) continue;
    const gain = p.menuPrice - 2 * p.costPrice;
    const bestGain = best ? best.menuPrice - 2 * best.costPrice : -1;
    if (!best || gain > bestGain || (gain === bestGain && p.qty > best.qty)) best = p;
  }
  if (!best) return null;
  return {
    product: best,
    threshold,
    newBasket: threshold + best.menuPrice,
    basketGain: best.menuPrice,
    realCost: 2 * best.costPrice,
    marginGain: best.menuPrice - 2 * best.costPrice,
  };
}

// ─── Cycle de paie du mois (stratégies terrain, ADR 0022) ────────────────────

// Quatrième et cinquième stratégies terrain, basées sur le calendrier :
// les clients sont payés en fin/début de mois — c'est là qu'ils ont le plus
// d'argent, donc là qu'on pousse l'offre qui fait le plus gros ticket. Le
// corollaire : autour du 20, les portefeuilles sont vides — si le trafic
// baisse à ce moment-là, on crée une offre à PETIT PRIX D'ENTRÉE : le but
// est de faire une vente, même petite, plutôt que rien.

// Semaine de paie : fin de mois + tout début de mois (7 jours calendaires).
export const PAYDAY_DAYS = new Set([28, 29, 30, 31, 1, 2, 3]);
// Semaine du 20 : le creux de trésorerie des ménages (7 jours).
export const TIGHT_DAYS = new Set([18, 19, 20, 21, 22, 23, 24]);
// Creux avéré : la semaine du 20 vend moins de 75 % de la semaine de paie.
export const MONTH_DIP_RATIO = 0.75;
// Un vrai produit d'appel, pas une sauce : prix carte minimal de l'offre
// petit budget.
export const TIGHT_MIN_PRICE = 3;

export type MonthEndDip = { tightQty: number; paydayQty: number; ratio: number };

// Le creux du 20 existe-t-il chez CET établissement ? Comparaison des volumes
// vendus par jour du mois entre les deux fenêtres (7 jours chacune — les 29/30/31
// manquent à certains mois, biais mineur assumé au MVP).
export function findMonthEndDip(byMonthDay: number[], totalItems: number): MonthEndDip | null {
  if (totalItems < MIN_ITEMS_FOR_INSIGHTS) return null;
  const sum = (days: Set<number>) =>
    Array.from(days).reduce((s, d) => s + (byMonthDay[d] ?? 0), 0);
  const paydayQty = sum(PAYDAY_DAYS);
  const tightQty = sum(TIGHT_DAYS);
  if (paydayQty === 0) return null;
  const ratio = tightQty / paydayQty;
  if (ratio >= MONTH_DIP_RATIO) return null;
  return { tightQty, paydayQty, ratio };
}

export type TightBudgetOffer = { product: ProductStat; discountPct: number; newPrice: number };

// Offre petit budget : le produit prouvé le MOINS CHER (≥ €3) qui supporte
// une remise sûre — on abaisse le ticket d'entrée au maximum, la marge reste
// préservée (safeDiscountPct cède au plus la moitié de la marge).
export function suggestTightBudgetOffer(
  products: ProductStat[],
  totalItems: number
): TightBudgetOffer | null {
  if (totalItems < MIN_ITEMS_FOR_INSIGHTS) return null;
  const candidates = products
    .filter((p) => p.qty > 0 && p.menuPrice >= TIGHT_MIN_PRICE && safeDiscountPct(p.menuPrice, p.costPrice) !== null)
    .sort((a, b) => a.menuPrice - b.menuPrice || b.qty - a.qty);
  if (candidates.length === 0) return null;
  const product = candidates[0];
  const discountPct = safeDiscountPct(product.menuPrice, product.costPrice)!;
  return { product, discountPct, newPrice: round50(product.menuPrice * (1 - discountPct / 100)) };
}

// Décalage de jours sur une date calendaire ISO (YYYY-MM-DD).
export function addDaysISO(iso: string, days: number): string {
  return new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

// Prochaine date dont le jour du mois tombe dans la fenêtre, avec l'avance
// minimale pour que l'annonce de la veille puisse encore partir (ADR 0023).
export function nextDateInMonthDays(todayISO: string, days: Set<number>, minLead = 2): string {
  let d = addDaysISO(todayISO, minLead);
  for (let i = 0; i < 40; i++) {
    if (days.has(new Date(`${d}T00:00:00Z`).getUTCDate())) return d;
    d = addDaysISO(d, 1);
  }
  return d; // inatteignable : toute fenêtre mensuelle survient sous 40 jours
}

// ─── Contextes calendaires : saisons & événements (stratégie terrain, ADR 0022) ─

// Sixième stratégie terrain — la règle générale : le calendrier définit des
// CONTEXTES (grandes vacances, vacances d'hiver, compétition sportive), et
// chaque contexte impose un ANGLE de communication :
//   - été       → attirer avec les produits de saison (juillet-août vend moins) ;
//   - réconfort → l'hiver, rappeler qu'on a des plats chauds et réconfortants ;
//   - groupe    → pendant un événement sportif, les gens se réunissent pour
//                 regarder ensemble → offre qui vise les groupes.
// On ne communique PAS forcément une promo : pour les saisons, montrer le bon
// produit au bon moment suffit — zéro remise, zéro risque de marge.

export type SeasonAngle = "ete" | "reconfort" | "groupe";

export type CalendarContext = {
  key: string;
  label: string;
  angle: SeasonAngle;
  start: string; // YYYY-MM-DD
  end: string;
};

// Grands événements sportifs à venir (dates connues à l'avance — à compléter
// au fil des annonces officielles, une ligne par événement).
export const SPORT_EVENTS: { label: string; start: string; end: string }[] = [
  { label: "Coupe du Monde 2026", start: "2026-06-11", end: "2026-07-19" },
  { label: "Euro 2028", start: "2028-06-09", end: "2028-07-09" },
  { label: "JO de Los Angeles 2028", start: "2028-07-14", end: "2028-07-30" },
  { label: "Coupe du Monde 2030", start: "2030-06-08", end: "2030-07-21" },
];

// Contextes en cours ou démarrant sous `leadDays` jours — l'annonce d'un
// contexte à venir part la veille de son début (ADR 0023) ; un contexte en
// cours se communique tout de suite.
export function upcomingCalendarContexts(todayISO: string, leadDays = 21): CalendarContext[] {
  const year = parseInt(todayISO.slice(0, 4), 10);
  const windows: CalendarContext[] = [];
  for (const y of [year - 1, year, year + 1]) {
    windows.push({
      key: `ete-${y}`,
      label: "Grandes vacances",
      angle: "ete",
      start: `${y}-07-01`,
      end: `${y}-08-31`,
    });
    // Les vacances d'hiver chevauchent le nouvel an : début en décembre de
    // l'année y, fin début janvier de y+1.
    windows.push({
      key: `hiver-${y}`,
      label: "Vacances d'hiver",
      angle: "reconfort",
      start: `${y}-12-20`,
      end: `${y + 1}-01-05`,
    });
  }
  for (const e of SPORT_EVENTS) {
    windows.push({ key: `event-${e.start}`, label: e.label, angle: "groupe", start: e.start, end: e.end });
  }
  const horizon = addDaysISO(todayISO, leadDays);
  return windows
    .filter((w) => w.end >= todayISO && w.start <= horizon)
    .sort((a, b) => (a.start < b.start ? -1 : 1));
}

// Correspondance saisonnière par mots-clés sur nom + catégorie (normalisés
// sans accents). Les listes sont volontairement prudentes : un raté laisse
// la carte sans produit (communication générique) plutôt qu'un contresens.
const SEASON_KEYWORDS: Record<Exclude<SeasonAngle, "groupe">, string[]> = {
  ete: ["glace", "ice", "sorbet", "smoothie", "milkshake", "frappe", "salade", "froid", "fraich", "limonade", "bubble tea", "fruit"],
  reconfort: ["soupe", "gratin", "chaud", "raclette", "fondue", "tartiflette", "curry", "ragout", "stew", "braise", "mijote"],
};

const normalize = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// Produits collant à l'angle saisonnier, classés par valeur perçue par euro
// de coût. Volontairement SANS filtre sur les ventes récentes : un produit
// d'été s'est peu vendu hors saison — c'est précisément pour ça qu'on le
// remet en avant.
export function matchSeasonalProducts(
  products: ProductStat[],
  angle: Exclude<SeasonAngle, "groupe">,
  limit = 3
): ProductStat[] {
  const words = SEASON_KEYWORDS[angle];
  return products
    .filter((p) => {
      const hay = normalize(p.name);
      return p.menuPrice > 0 && words.some((w) => hay.includes(w));
    })
    .sort((a, b) => {
      const ra = a.costPrice > 0 ? a.menuPrice / a.costPrice : 0;
      const rb = b.costPrice > 0 ? b.menuPrice / b.costPrice : 0;
      return rb - ra;
    })
    .slice(0, limit);
}

export type GroupPack = {
  main: ProductStat;
  side: ProductStat;
  fullPrice: number; // 4 plats + 2 accompagnements au prix carte
  packPrice: number;
  saving: number;
  margin: number;
};

// Pack de groupe pour un événement sportif : 4× le plat le mieux vendu +
// 2× l'accompagnement à partager au coût le plus bas. Économie affichée
// ~10 % du prix carte, plafonnée à la moitié de la marge (même règle que
// les combos) — le pack reste largement rentable.
export function suggestGroupPack(products: ProductStat[], totalItems: number): GroupPack | null {
  if (totalItems < MIN_ITEMS_FOR_INSIGHTS) return null;
  // Un plat, pas un accompagnement : le cœur du pack se prend au-dessus du
  // prix médian du catalogue (sinon le best-seller absolu — souvent les
  // frites — deviendrait le plat du pack).
  const prices = products.map((p) => p.menuPrice).sort((a, b) => a - b);
  const medianPrice = prices[Math.floor(prices.length / 2)] ?? 0;
  const main = [...products]
    .filter((p) => p.qty > 0 && p.costPrice > 0 && p.menuPrice - p.costPrice > 0 && p.menuPrice >= medianPrice)
    .sort((a, b) => b.qty - a.qty)[0];
  if (!main) return null;
  const side = [...products]
    .filter(
      (p) =>
        p.id !== main.id &&
        p.qty > 0 &&
        p.costPrice > 0 &&
        p.menuPrice < main.menuPrice &&
        p.costPrice / p.menuPrice <= RUSH_SIDE_MAX_COST_RATIO
    )
    .sort((a, b) => a.costPrice / a.menuPrice - b.costPrice / b.menuPrice)[0];
  if (!side) return null;

  const fullPrice = 4 * main.menuPrice + 2 * side.menuPrice;
  const fullMargin = 4 * (main.menuPrice - main.costPrice) + 2 * (side.menuPrice - side.costPrice);
  const saving = round50(Math.min(fullPrice * 0.1, fullMargin * 0.5));
  if (saving < 0.5) return null;
  return {
    main,
    side,
    fullPrice,
    packPrice: round50(fullPrice - saving),
    saving,
    margin: fullMargin - saving,
  };
}

// ─── Planification des promos (ADR 0023) ─────────────────────────────────────

// Une suggestion liée à un jour de semaine vise sa PROCHAINE occurrence, avec
// assez d'avance pour que l'annonce parte la veille : promo au plus tôt à
// J+2 (sinon on saute à la semaine suivante), annonce = promo − 1 jour.
// Jamais plus tôt que J-2 : un membre notifié le samedi pour une promo du
// mardi reporterait sa commande du week-end — l'annonce précoce cannibalise
// les jours pleins.
export function nextPromoDates(
  todayISO: string,
  weekday: number // 0 = lundi … 6 = dimanche (convention WEEKDAY_LABELS)
): { promoOn: string; sendOn: string } {
  const base = new Date(`${todayISO}T00:00:00Z`);
  const todayIdx = (base.getUTCDay() + 6) % 7;
  let diff = (weekday - todayIdx + 7) % 7;
  if (diff < 2) diff += 7;
  const promo = new Date(base.getTime() + diff * 86_400_000);
  const send = new Date(promo.getTime() - 86_400_000);
  return {
    promoOn: promo.toISOString().slice(0, 10),
    sendOn: send.toISOString().slice(0, 10),
  };
}

// ─── Offres par type d'équipe × créneau (stratégie terrain, ADR 0022) ────────

// Septième stratégie terrain : les équipes sont typées (école, entreprise,
// taxis, rue/quartier — ADR 0014) et chaque type a SON créneau naturel (les
// écoles à midi, les taxis la nuit). Croiser le type avec ses heures réelles
// de commande permet une offre dédiée, broadcastée à ce type uniquement —
// l'infra de ciblage existe déjà (broadcast par type).

// Volume minimal d'articles pour oser typer un créneau.
export const TYPE_SLOT_MIN_ITEMS = 15;

export type PeakWindow = { start: number; end: number; qty: number; share: number };

// Fenêtre contiguë de 2 h la plus CHARGÉE (miroir de findQuietHours), en
// enjambant minuit — le pic d'un type « taxis » est souvent 23h–1h.
export function peakWindow(byHour: number[]): PeakWindow | null {
  const total = byHour.reduce((s, v) => s + v, 0);
  if (total === 0) return null;
  let best: { start: number; qty: number } | null = null;
  for (let h = 0; h < 24; h++) {
    const qty = byHour[h] + byHour[(h + 1) % 24];
    if (!best || qty > best.qty) best = { start: h, qty };
  }
  if (!best || best.qty === 0) return null;
  return { start: best.start, end: (best.start + 2) % 24, qty: best.qty, share: best.qty / total };
}

export type TeamTypeSlot = { type: string; qty: number; peak: PeakWindow };

// Types d'équipe avec assez de volume ET un créneau qui se détache (la
// fenêtre de 2 h concentre ≥ 25 % du volume du type). Le type « autre » est
// ignoré : pas d'identité commune, pas d'offre dédiée.
export function findTeamTypeSlots(
  byType: Map<string, number[]>,
  limit = 2
): TeamTypeSlot[] {
  const out: TeamTypeSlot[] = [];
  byType.forEach((byHour, type) => {
    if (type === "autre") return;
    const qty = byHour.reduce((s, v) => s + v, 0);
    if (qty < TYPE_SLOT_MIN_ITEMS) return;
    const peak = peakWindow(byHour);
    if (!peak || peak.share < 0.25) return;
    out.push({ type, qty, peak });
  });
  return out.sort((a, b) => b.qty - a.qty).slice(0, limit);
}

// ─── Audit de carte — menu engineering (stratégie terrain, ADR 0022) ─────────

// Huitième stratégie terrain : croiser popularité × marge pour classer chaque
// article — le regard qu'un consultant pose sur une carte en rendez-vous.
//   stars      (populaire, forte marge)  → protéger, ne pas toucher au prix ;
//   workhorses (populaire, faible marge) → repricer légèrement ou combiner ;
//   puzzles    (invendu, forte marge)    → mettre en avant ;
//   dogs       (invendu, faible marge)   → retirer ou repenser.
// Seuils classiques du menu engineering : popularité ≥ 70 % de la vente
// moyenne par article, marge ≥ marge moyenne pondérée par les ventes.

export type MenuAudit = {
  stars: ProductStat[];
  workhorses: ProductStat[];
  puzzles: ProductStat[];
  dogs: ProductStat[];
  popThreshold: number;
  marginThreshold: number;
};

export function menuEngineering(products: ProductStat[], totalItems: number): MenuAudit | null {
  if (totalItems < MIN_ITEMS_FOR_INSIGHTS) return null;
  const withPrice = products.filter((p) => p.menuPrice > 0);
  if (withPrice.length < 4) return null;

  const totalQty = withPrice.reduce((s, p) => s + p.qty, 0);
  if (totalQty === 0) return null;
  const popThreshold = (totalQty / withPrice.length) * 0.7;
  const soldQty = withPrice.reduce((s, p) => s + p.qty, 0);
  const marginThreshold =
    withPrice.reduce((s, p) => s + (p.menuPrice - p.costPrice) * p.qty, 0) / soldQty;

  const audit: MenuAudit = { stars: [], workhorses: [], puzzles: [], dogs: [], popThreshold, marginThreshold };
  for (const p of withPrice) {
    const popular = p.qty >= popThreshold;
    const highMargin = p.menuPrice - p.costPrice >= marginThreshold;
    if (popular && highMargin) audit.stars.push(p);
    else if (popular) audit.workhorses.push(p);
    else if (highMargin) audit.puzzles.push(p);
    else audit.dogs.push(p);
  }
  const byQty = (a: ProductStat, b: ProductStat) => b.qty - a.qty;
  const byMargin = (a: ProductStat, b: ProductStat) =>
    b.menuPrice - b.costPrice - (a.menuPrice - a.costPrice);
  audit.stars.sort(byQty);
  audit.workhorses.sort(byQty);
  audit.puzzles.sort(byMargin);
  audit.dogs.sort(byQty);
  return audit;
}

// ─── Effet leurre sur les tailles (stratégie terrain, ADR 0022) ──────────────

// Neuvième stratégie terrain, cousine de la formule dégressive : quand un
// produit existe en deux tailles, un écart de prix trop grand fait hésiter —
// on REMONTE la petite taille pour que la grande devienne une évidence
// (medium €4,50, large €5 → tout le monde prend la large). On ne remise
// rien : on repositionne la perception. Pas de broadcast — un repricing ne
// s'annonce pas aux clients.

// Écart cible entre les deux tailles : 10 % du prix de la grande (calibré
// sur l'exemple de référence €4,50 / €5).
export const DECOY_GAP_RATIO = 0.1;
// Hausse maximale de la petite taille : +25 % de son prix actuel — au-delà,
// les habitués vivraient la hausse comme une trahison ; des tailles trop
// éloignées ne sont pas un leurre, c'est un autre produit.
export const DECOY_MAX_RAISE_RATIO = 0.25;

// Marqueurs de taille reconnus dans les noms d'articles (mots entiers,
// normalisés sans accents) + les quantités type « 6 pcs ».
const SIZE_TOKENS = [
  "mini", "small", "petit", "petite", "moyen", "moyenne", "medium",
  "large", "grand", "grande", "maxi", "xl", "xxl",
];
const SIZE_TOKEN_RE = new RegExp(`\\b(${SIZE_TOKENS.join("|")})\\b`, "g");
const PCS_RE = /\b\d+\s*(?:pcs|pieces|pc)\b/g;

// Nom de base d'un article si son nom contient un marqueur de taille —
// « Frites Medium » → « frites », « Churros 6 pcs » → « churros ».
export function sizeBaseName(name: string): string | null {
  const norm = normalize(name);
  const base = norm.replace(SIZE_TOKEN_RE, "").replace(PCS_RE, "").replace(/\s+/g, " ").trim();
  if (base === norm || base.length < 3) return null;
  return base;
}

export type SizeDecoy = {
  base: string;
  medium: ProductStat;          // la petite des deux (par prix)
  large: ProductStat;
  suggestedMediumPrice: number; // nouveau prix de la petite taille
  stayUplift: number;           // gain sur un client qui reste à la petite
  switchUplift: number;         // gain de marge sur un client qui bascule
};

// Paires de tailles dont l'écart de prix fait hésiter : suggérer de remonter
// la petite pour que « passer à la grande » coûte ~10 % du prix de la grande.
// Garde-fous : jamais de baisse de prix, et la grande doit avoir une
// meilleure marge que la petite (sinon pousser vers elle appauvrit).
export function suggestSizeDecoys(
  products: ProductStat[],
  totalItems: number,
  limit = 2
): SizeDecoy[] {
  if (totalItems < MIN_ITEMS_FOR_INSIGHTS) return [];
  const groups = new Map<string, ProductStat[]>();
  for (const p of products) {
    if (p.menuPrice <= 0) continue;
    const base = sizeBaseName(p.name);
    if (!base) continue;
    groups.set(base, [...(groups.get(base) ?? []), p]);
  }

  const out: SizeDecoy[] = [];
  groups.forEach((list, base) => {
    if (list.length < 2) return;
    const sorted = [...list].sort((a, b) => b.menuPrice - a.menuPrice);
    const [large, medium] = sorted; // les deux plus chères du groupe
    if (large.menuPrice <= medium.menuPrice) return;
    const switchUplift =
      large.menuPrice - large.costPrice - (medium.menuPrice - medium.costPrice);
    if (switchUplift <= 0) return;
    const suggested = round50(large.menuPrice * (1 - DECOY_GAP_RATIO));
    if (suggested <= medium.menuPrice) return; // écart déjà irrésistible
    if (suggested > medium.menuPrice * (1 + DECOY_MAX_RAISE_RATIO)) return; // hausse trop brutale
    out.push({
      base,
      medium,
      large,
      suggestedMediumPrice: suggested,
      stayUplift: suggested - medium.menuPrice,
      switchUplift,
    });
  });

  return out.sort((a, b) => b.medium.qty - a.medium.qty).slice(0, limit);
}

// Clé canonique d'une paire de produits (ordre stable)
export function pairKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
}
