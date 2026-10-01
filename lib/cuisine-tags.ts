// Types de cuisine proposés à l'inscription restaurateur (ADR 0075 §1) : le
// restaurateur coche des étiquettes au lieu de taper. Les propositions sont
// classées d'après ce que Google sait de l'établissement (catégorie, types de
// lieu) et son nom ; il peut toujours ajouter la sienne. Module pur, testé.

export const CUISINE_MAX = 5;

type Tag = { label: string; keys: string[] };

// `keys` : mots cherchés dans le nom, la catégorie Google et les types de lieu
// Google (« hamburger_restaurant » → « hamburger restaurant »), sans accents.
export const CUISINE_TAGS: Tag[] = [
  { label: "Burger", keys: ["burger", "hamburger"] },
  { label: "Smash burger", keys: ["smash"] },
  { label: "Poulet frit", keys: ["chicken", "poulet", "fried chicken", "wings", "tenders"] },
  { label: "Pizza", keys: ["pizza", "pizzeria"] },
  { label: "Kebab", keys: ["kebab", "doner", "shawarma", "durum", "gyros"] },
  { label: "Tacos", keys: ["tacos"] },
  { label: "Friterie", keys: ["friterie", "frituur", "fritkot", "frites"] },
  { label: "Snack", keys: ["snack", "fast food"] },
  { label: "Sandwicherie", keys: ["sandwich", "bagel", "panini", "sub"] },
  { label: "Sushi", keys: ["sushi", "maki"] },
  { label: "Japonais", keys: ["japanese", "japonais", "ramen"] },
  { label: "Poké", keys: ["poke", "poké"] },
  { label: "Chinois", keys: ["chinese", "chinois", "wok", "dim sum"] },
  { label: "Thaï", keys: ["thai"] },
  { label: "Vietnamien", keys: ["vietnamese", "vietnamien", "pho", "banh mi"] },
  { label: "Coréen", keys: ["korean", "coreen"] },
  { label: "Asiatique", keys: ["asian", "asiatique", "noodle"] },
  { label: "Indien", keys: ["indian", "indien", "curry", "tandoori"] },
  { label: "Italien", keys: ["italian", "italien", "pasta", "trattoria"] },
  { label: "Libanais", keys: ["lebanese", "libanais", "falafel"] },
  { label: "Turc", keys: ["turkish", "turc", "pide", "lahmacun"] },
  { label: "Marocain", keys: ["moroccan", "marocain", "tajine", "couscous"] },
  { label: "Grec", keys: ["greek", "grec", "souvlaki"] },
  { label: "Méditerranéen", keys: ["mediterranean", "mediterraneen", "middle eastern"] },
  { label: "Africain", keys: ["african", "africain", "senegal", "congo"] },
  { label: "Mexicain", keys: ["mexican", "mexicain", "burrito"] },
  { label: "Américain", keys: ["american", "americain", "diner"] },
  { label: "Portugais", keys: ["portuguese", "portugais"] },
  { label: "Espagnol", keys: ["spanish", "espagnol", "tapas"] },
  { label: "Grill", keys: ["grill", "barbecue", "bbq", "steak", "steakhouse"] },
  { label: "Fruits de mer", keys: ["seafood", "poisson", "fish"] },
  { label: "Halal", keys: ["halal"] },
  { label: "Végétarien", keys: ["vegetarian", "vegetarien", "veggie"] },
  { label: "Vegan", keys: ["vegan"] },
  { label: "Healthy", keys: ["healthy", "salad", "salade", "bowl", "juice"] },
  { label: "Brunch", keys: ["brunch", "breakfast", "petit dejeuner"] },
  { label: "Café", keys: ["cafe", "coffee", "koffie"] },
  { label: "Boulangerie", keys: ["bakery", "boulangerie", "bakkerij"] },
  { label: "Pâtisserie", keys: ["patisserie", "pastry", "cake"] },
  { label: "Desserts", keys: ["dessert", "ice cream", "glace", "glacier", "gaufre", "crepe", "donut"] },
  { label: "Bubble tea", keys: ["bubble tea", "boba"] },
  { label: "Livraison", keys: ["meal delivery"] },
  { label: "À emporter", keys: ["meal takeaway", "takeaway", "take away"] },
];

// Proposées quand Google et le nom ne disent rien : les plus courantes chez nos restaurateurs.
const DEFAULTS = ["Burger", "Pizza", "Poulet frit", "Kebab", "Snack", "Sandwicherie", "Asiatique", "Italien"];

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hit(text: string, key: string): boolean {
  return ` ${text} `.includes(` ${norm(key)} `) || ` ${text} `.includes(` ${norm(key)}s `);
}

/**
 * Les étiquettes à proposer, les plus probables d'abord : d'abord ce que dit
 * Google (types de lieu, catégorie), puis le nom, puis les plus courantes.
 * Jamais une étiquette déjà choisie.
 */
export function suggestCuisineTags(
  hints: { name?: string | null; category?: string | null; types?: string[] | null },
  chosen: string[] = [],
  max = 8,
): string[] {
  const taken = new Set(chosen.map(norm));
  const google = norm([hints.category ?? "", ...(hints.types ?? [])].join(" "));
  const name = norm(hints.name ?? "");
  const out: string[] = [];
  const push = (label: string) => {
    if (out.length < max && !taken.has(norm(label)) && !out.includes(label)) out.push(label);
  };
  for (const t of CUISINE_TAGS) if (t.keys.some((k) => hit(google, k))) push(t.label);
  for (const t of CUISINE_TAGS) if (t.keys.some((k) => hit(name, k))) push(t.label);
  for (const d of DEFAULTS) push(d);
  return out;
}

/** Une étiquette tapée à la main : nettoyée, majuscule initiale, reprise du catalogue si elle y est. */
export function normalizeCuisineTag(raw: string): string {
  const clean = raw.replace(/\s+/g, " ").trim().slice(0, 40);
  if (!clean) return "";
  const known = CUISINE_TAGS.find((t) => norm(t.label) === norm(clean));
  return known ? known.label : clean.charAt(0).toUpperCase() + clean.slice(1);
}

/** Ajoute une étiquette (sans doublon, plafond CUISINE_MAX). */
export function addCuisineTag(chosen: string[], raw: string): string[] {
  const tag = normalizeCuisineTag(raw);
  if (!tag || chosen.length >= CUISINE_MAX || chosen.some((c) => norm(c) === norm(tag))) return chosen;
  return [...chosen, tag];
}
