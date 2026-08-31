// ADR 0020, amendé ADR 0046 — Rapprochement des libellés de ticket vers le
// catalogue. Tous les niveaux sont DÉTERMINISTES : pas de fuzzy silencieux
// (un faux positif polluerait les stats resto ; un raté laisse simplement
// menu_item_id à NULL, et la boucle de complétion s'en charge).
//
// Ordre de résolution pour un libellé L :
//   1. alias du resto sur L normalisé (menu_item_aliases — posés par le seed
//      et les rapprochements manuels) ; alias → NULL = ligne « à ignorer » ;
//   2. égalité stricte catalogue sur L normalisé (comportement historique) ;
//   3. ligne technique de caisse (ajustement TVA, remise, livraison…) → ignorée ;
//   4. libellé CANONISÉ : les caisses suffixent la catégorie — « Finest
//      (Burger) » — et concatènent les options — « Smoky Menu (Medium
//      Fries) + Pepsi » : on tronque au premier « + » (l'article principal
//      porte le prix) et on retire les parenthèses finales SANS chiffre
//      (« (Burger) » oui ; « (16) » non — ce sont les tailles du catalogue) ;
//      puis alias et catalogue sur cette forme.

export type TicketAlias = { alias: string; menu_item_id: string | null };
export type TicketLineMatch = { menuItemId: string | null; ignored: boolean };

export function normalizeItemName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // retire les accents combinants
    .replace(/\bchilli\b/g, "chili") // équivalence de graphie sûre (caisse EN)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Tronque au premier « + », retire les parenthèses finales sans chiffre, normalise. */
export function canonicalizeTicketLabel(raw: string): string {
  let s = raw.split(/\s\+\s/)[0].trim();
  for (;;) {
    const m = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(s);
    if (!m || m[1].trim() === "" || /\d/.test(m[2])) break;
    s = m[1].trim();
  }
  return normalizeItemName(s);
}

// Lignes techniques de caisse (testées sur le libellé NORMALISÉ) — liste
// volontairement conservatrice : au doute, on laisse la ligne non rattachée
// (la boucle de complétion propose « ignorer » au restaurateur).
const TECHNICAL_LINE_PATTERNS: RegExp[] = [
  /vat ?adjustment/,
  /\btva\b/,
  /\bbtw\b/,
  /service charge|frais de service/,
  /^remise\b/,
  /^discount\b/,
  /^korting\b/,
  /^consigne\b/,
  /statiegeld/,
  /^(delivery|livraison|bezorg)/,
  /^pourboire\b/,
  /^fooi\b/,
  /^tip\b/,
];

export function isTechnicalLine(normalized: string): boolean {
  return normalized !== "" && TECHNICAL_LINE_PATTERNS.some((p) => p.test(normalized));
}

export function buildTicketMatcher(
  items: { id: string; name: string }[],
  aliases: TicketAlias[] = []
): (rawName: string) => TicketLineMatch {
  const catalog = new Map<string, string>();
  for (const item of items) {
    const key = normalizeItemName(item.name);
    if (key !== "" && !catalog.has(key)) catalog.set(key, item.id);
  }
  const aliasMap = new Map<string, string | null>();
  for (const a of aliases) {
    const key = normalizeItemName(a.alias);
    if (key !== "" && !aliasMap.has(key)) aliasMap.set(key, a.menu_item_id);
  }

  const resolve = (key: string): TicketLineMatch | null => {
    if (key === "") return null;
    if (aliasMap.has(key)) {
      const id = aliasMap.get(key) ?? null;
      return { menuItemId: id, ignored: id === null };
    }
    const id = catalog.get(key);
    return id ? { menuItemId: id, ignored: false } : null;
  };

  return (rawName: string) => {
    const norm = normalizeItemName(rawName);
    const direct = resolve(norm);
    if (direct) return direct;
    if (isTechnicalLine(norm)) return { menuItemId: null, ignored: true };
    const canon = canonicalizeTicketLabel(rawName);
    if (canon !== norm) {
      const viaCanon = resolve(canon);
      if (viaCanon) return viaCanon;
      if (isTechnicalLine(canon)) return { menuItemId: null, ignored: true };
    }
    return { menuItemId: null, ignored: false };
  };
}

/** Compat historique : id seul, sans la notion « ignorée ». */
export function buildMenuMatcher(
  items: { id: string; name: string }[]
): (rawName: string) => string | null {
  const match = buildTicketMatcher(items);
  return (rawName: string) => match(rawName).menuItemId;
}
