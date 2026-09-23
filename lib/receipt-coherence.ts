// ============================================================
// Est-ce que cette lecture tient debout ? (ADR 0066)
//
// Terrain Kraainem, 2026-09-20 : un même ticket de 73,30 € photographié deux
// fois a produit DEUX commandes validées. La seconde photo, prise de loin, a
// été lue de travers — total 73,50 €, numéro inventé (`…/221/04145` au lieu
// de `…/223/01645`), et des articles qui n'existent pas au menu (« Wagyu
// Roast », « Sakisoba Rice »). Comme tout différait, aucune protection
// anti-doublon ne pouvait s'en apercevoir : elles comparent des valeurs, et
// les valeurs étaient fausses.
//
// La parade n'est pas un anti-doublon de plus : c'est de vérifier que la
// LECTURE est cohérente avec ce qu'un vrai ticket de cet établissement
// contient. Chaque contrôle porte un nom : il explique au client quoi
// reprendre, et il explique au restaurateur pourquoi un ticket est refusé.
//
// ⚠️ Phase 1 (décision du porteur) : ces contrôles sont CALCULÉS et
// CONSERVÉS à chaque lecture, mais ne refusent rien. On mesure d'abord, sur
// de vrais tickets, lesquels sont fiables — ensuite seulement on refuse
// (bouclier, ADR 0065 : la trace avant la règle).
//
// Pur, sans dépendance serveur.
// ============================================================

export type CoherenceCheck =
  /** L'heure de commande imprimée a été lue (elle l'est sur ~85 % des lectures). */
  | "time_read"
  /** Les articles lus ressemblent à la carte de CET établissement. */
  | "items_match_menu"
  /** La somme des lignes retombe sur le total (seulement si tout est lisible). */
  | "items_sum_matches_total"
  /** La date contenue dans le numéro de commande est celle imprimée sur le ticket. */
  | "key_date_matches_printed";

export type CoherenceResult = {
  /** Contrôle → vrai (cohérent), faux (incohérent), absent (non testable ici). */
  checks: Partial<Record<CoherenceCheck, boolean>>;
  /** Contrôles échoués, dans l'ordre — le premier sert de motif. */
  failed: CoherenceCheck[];
};

export type CoherenceInput = {
  amount: number | null;
  orderNumber: string | null;
  orderTime: string | null;
  printedDate: string | null;
  keyDate: string | null;
  items: { name: string; quantity: number; unit_price: number | null }[];
  /** Noms du catalogue de l'établissement (menu_items). */
  menuNames: string[];
  /** Le ticket porte une remise / un coupon : la somme des lignes ne peut pas retomber juste. */
  hasDiscount: boolean;
};

/** Part minimale d'articles reconnus au menu pour que la lecture tienne debout. */
export const MENU_MATCH_MIN_RATIO = 0.5;
/** Tolérance entre la somme des lignes et le total : 1 € ou 5 %. */
export const SUM_TOLERANCE_EUR = 1;
export const SUM_TOLERANCE_RATIO = 0.05;

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

// Les tickets écrivent l'article AVEC ses options (« Magnifique Beef Menu
// (Medium Fries) + Extra Cheese ») : on cherche donc un article du menu
// CONTENU dans la ligne lue, pas une égalité. Les lignes techniques de la
// caisse (ajustement de TVA) ne sont ni au menu ni un signe d'erreur.
function isTechnicalLine(name: string): boolean {
  const n = normalize(name);
  return n.includes("vatadjust") || n.includes("tvaajust") || n.includes("korting") || n.includes("coupon");
}

export function looksLikeMenuItem(name: string, menuNames: string[]): boolean {
  const line = normalize(name);
  if (!line) return false;
  return menuNames.some((menuName) => {
    const m = normalize(menuName);
    return m.length >= 4 && (line.includes(m) || m.includes(line));
  });
}

export function checkCoherence(input: CoherenceInput): CoherenceResult {
  const checks: Partial<Record<CoherenceCheck, boolean>> = {};

  checks.time_read = !!input.orderTime;

  const realLines = input.items.filter((i) => !isTechnicalLine(i.name));
  if (realLines.length > 0 && input.menuNames.length > 0) {
    const matched = realLines.filter((i) => looksLikeMenuItem(i.name, input.menuNames)).length;
    checks.items_match_menu = matched / realLines.length >= MENU_MATCH_MIN_RATIO;
  }

  const priced = input.items.filter((i) => i.unit_price != null);
  if (input.amount != null && !input.hasDiscount && priced.length > 0 && priced.length === input.items.length) {
    const sum = priced.reduce((total, i) => total + (i.unit_price ?? 0) * (i.quantity || 1), 0);
    const tolerance = Math.max(SUM_TOLERANCE_EUR, input.amount * SUM_TOLERANCE_RATIO);
    checks.items_sum_matches_total = Math.abs(sum - input.amount) <= tolerance;
  }

  if (input.keyDate && input.printedDate) {
    checks.key_date_matches_printed = input.keyDate === input.printedDate;
  }

  const failed = (Object.keys(checks) as CoherenceCheck[]).filter((name) => checks[name] === false);
  return { checks, failed };
}
