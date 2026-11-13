// La description d'un plat, écrite d'après son NOM seulement (ADR 0100 §7). Règle de fond : une description n'affirme
// jamais ce que le restaurateur n'a pas écrit. Pas de viande, pas d'ingrédient, pas d'origine, pas de label (maison,
// artisanal, halal, bio…) qui ne soit dans le nom du plat, sa catégorie, ou une réponse qu'il a donnée lui-même
// (« la viande de tes burgers »). La phrase de ton parle du CLIENT (« pour les grosses faims »), jamais du plat.
// Déterministe : le même plat donne toujours la même phrase. Pur et testé.

import { familyStrength, type Family } from "./families";
import { optionKey } from "./normalize";

export type Tone = "sobre" | "gourmand" | "fun";
export type Viande = "bœuf" | "poulet" | "mélange";

export const TONES: { value: Tone; label: string }[] = [
  { value: "sobre", label: "Sobre" },
  { value: "gourmand", label: "Gourmand" },
  { value: "fun", label: "Fun" },
];

export const DEFAULT_TONE: Tone = "gourmand";
export const MAX_DESCRIPTION = 300;

export type DescribeInput = {
  /** Sert à varier la phrase de ton d'un plat à l'autre, de façon stable. */
  id: string;
  name: string;
  category?: string | null;
  family: Family;
  tone: Tone;
  /** La réponse du restaurateur à « de quelle viande sont tes burgers quand le nom ne le dit pas ? » */
  viande?: Viande | null;
};

export type Described = {
  text: string;
  /** Le nom du plat contredit la réponse du restaurateur : on garde le nom et on le lui dit. */
  conflict?: string;
};

const hash = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Espaces en trop, point final, et un nom tout en majuscules (« PIZZA ROYALE ») remis en forme. */
function tidy(raw: string): string {
  let s = (raw ?? "").replace(/\s+/g, " ").trim().replace(/[.\s]+$/, "");
  if (s.length > 3 && s === s.toUpperCase() && /[A-ZÀ-Ý]/.test(s)) s = upperFirst(s.toLowerCase());
  return s;
}

/** « margherita » garde sa majuscule d'un mot ; « Quatre Fromages » devient « quatre fromages » dans la phrase. */
const softCase = (s: string) => (s.includes(" ") ? s.toLowerCase() : s);

// ─── Les noms de plats : « Une pizza Margherita », « Un durum poulet » ───────

type Noun = { art: "Un" | "Une" | "Des"; noun: string; token: string; strip: RegExp };
const NOUNS: Partial<Record<Family, Noun>> = {
  mitraillette: { art: "Une", noun: "mitraillette", token: "mitraillette", strip: /^mitraillettes?\s*/i },
  durum: { art: "Un", noun: "durum", token: "durum", strip: /^d[uü]r[uü]m\s*/i },
  pain_turc: { art: "Un", noun: "pain turc", token: "pain turc", strip: /^pains?\s+turcs?\s*/i },
  panini: { art: "Un", noun: "panini", token: "panini", strip: /^paninis?\s*/i },
  kapsalon: { art: "Un", noun: "kapsalon", token: "kapsalon", strip: /^kapsalons?\s*/i },
  sandwich: { art: "Un", noun: "sandwich", token: "sandwich", strip: /^sandwich(?:s|es)?\s*/i },
  wrap: { art: "Un", noun: "wrap", token: "wrap", strip: /^wraps?\s*/i },
  tacos: { art: "Un", noun: "tacos", token: "tacos", strip: /^tacos\s*/i },
  pizza: { art: "Une", noun: "pizza", token: "pizza", strip: /^pizzas?\s*/i },
  pates: { art: "Des", noun: "pâtes", token: "pates", strip: /^p[aâ]tes\s*/i },
};

/** Le nom du plat devant la phrase seulement si le restaurateur l'a écrit (dans le nom ou dans sa catégorie). */
function nounBase(family: Family, name: string, category?: string | null): string | null {
  const rule = NOUNS[family];
  if (!rule) return null;
  if (!plain(`${name} ${category ?? ""}`).includes(rule.token)) return null;
  const rest = name.replace(rule.strip, "").trim();
  return rest ? `${rule.art} ${rule.noun} ${softCase(rest)}` : `${rule.art} ${rule.noun}`;
}

// ─── Les burgers : la viande est le point sensible ───────────────────────────

const VEG = /v[eé]g[eé]tarien|veggie|vegan/i;
const MEAT: [RegExp, (m: RegExpMatchArray) => { phrase: string; word: Viande }][] = [
  [/\b(poulet|chicken)(\s+(?:croustillant|crispy|pan[eé]|grill[eé]))?/i, (m) => ({ phrase: `au poulet${m[2] ? m[2].toLowerCase().replace(/crispy/, "croustillant").replace(/pane/, "pané").replace(/grille/, "grillé") : ""}`, word: "poulet" })],
  [/\b(b(?:œ|oe)uf|beef)\b/i, () => ({ phrase: "au bœuf", word: "bœuf" })],
  [/\bsteak(?:\s+hach[eé])?/i, (m) => ({ phrase: `au ${m[0].toLowerCase().replace(/hache/, "haché")}`, word: "bœuf" })],
];
const HINTS: [RegExp, string][] = [[/cheddar/i, "au cheddar"], [/cheese|fromage/i, "au fromage"], [/bacon|lard/i, "au bacon"]];

function burgerBase(name: string, viande: Viande | null | undefined): { base: string; conflict?: string } | null {
  if (VEG.test(name)) return { base: "Un burger végétarien" };
  let meat: { phrase: string; word: Viande } | null = null;
  for (const [rx, make] of MEAT) { const m = name.match(rx); if (m) { meat = make(m); break; } }
  const hints = HINTS.filter(([rx]) => rx.test(name)).map(([, p]) => p);
  // Cheddar et fromage disent la même chose : on garde le plus précis.
  const uniq = hints.includes("au cheddar") ? hints.filter((h) => h !== "au fromage") : hints;

  let first: string | null = null;
  let conflict: string | undefined;
  if (meat) {
    first = meat.phrase;
    if (viande && viande !== "mélange" && viande !== meat.word) conflict = `Le nom dit « ${meat.phrase.replace(/^au /, "")} », ta réponse dit « ${viande} » : nous avons gardé ce que dit le nom.`;
  } else if (viande && viande !== "mélange") first = `de ${viande}`;

  if (!first && uniq.length === 0) return null; // rien de reconnu : on garde le nom tel que le restaurateur l'a écrit
  const parts = first ? [first, ...uniq] : uniq;
  const base = first?.startsWith("de ") ? `Un burger ${[first, uniq.join(" et ")].filter(Boolean).join(" ")}` : `Un burger ${parts.join(" et ")}`;
  return { base, conflict };
}

// ─── Le ton : une phrase qui parle du client ─────────────────────────────────

const SNACKS: Family[] = ["mitraillette", "durum", "pain_turc", "kapsalon", "panini", "sandwich", "wrap", "tacos", "poulet_frit", "snack_friture"];
const ITALIAN: Family[] = ["pizza", "pates", "assiette"];

const CLOSERS: Record<"gourmand" | "fun", Record<"snack" | "italian" | "burger" | "autre", string[]>> = {
  gourmand: {
    snack: ["pour les grosses faims", "pour les vraies faims", "pour les gourmands"],
    italian: ["pour se faire plaisir", "pour les gourmands", "à partager ou pas"],
    burger: ["pour les gourmands", "pour les grosses faims", "pour les amateurs de burgers"],
    autre: ["pour se faire plaisir", "pour les gourmands", "pour une pause gourmande"],
  },
  fun: {
    snack: ["pour les amateurs de sensations pures", "pour ceux qui n'ont pas peur d'avoir faim", "pour les gros appétits"],
    italian: ["pour les amateurs de sensations pures", "pour ceux qui aiment se faire plaisir", "pour les gros appétits"],
    burger: ["pour les amateurs de sensations pures", "pour ceux qui n'ont pas peur d'avoir faim", "pour les fans de burgers"],
    autre: ["pour les amateurs de sensations pures", "pour les curieux", "pour les gros appétits"],
  },
};

function closerFor(family: Family, tone: "gourmand" | "fun", id: string): string {
  const group = family === "burger" ? "burger" : SNACKS.includes(family) ? "snack" : ITALIAN.includes(family) ? "italian" : "autre";
  const list = CLOSERS[tone][group];
  return list[hash(id) % list.length];
}

/**
 * La description d'un plat, ou `null` quand il n'en faut pas (boissons, desserts et sauces : le nom suffit ; formule ou
 * article inconnu : nous ne savons pas ce que c'est).
 */
export function describeArticle(a: DescribeInput): Described | null {
  const strength = familyStrength(a.family);
  if (strength === null || strength === "aucune") return null;
  const name = tidy(a.name);
  if (!name) return null;

  let base: string | null = null;
  let conflict: string | undefined;
  if (a.family === "burger") {
    const b = burgerBase(name, a.viande);
    if (b) { base = b.base; conflict = b.conflict; }
  } else base = nounBase(a.family, name, a.category);
  base ??= upperFirst(name);

  const text = a.tone === "sobre" ? `${base}.` : `${base}, ${closerFor(a.family, a.tone, a.id)}.`;
  return { text: text.slice(0, MAX_DESCRIPTION), conflict };
}

// ─── Le garde-fou : rien d'inventé ───────────────────────────────────────────

// Des mots qui AFFIRMENT quelque chose sur le contenu ou la fabrication. Un seul de ces mots dans une description
// que ni le nom, ni la catégorie, ni une réponse du restaurateur ne contient est une invention.
const CLAIMS = [
  "boeuf", "poulet", "porc", "agneau", "veau", "dinde", "canard", "jambon", "bacon", "lard", "lardons", "saucisse", "merguez", "kefta", "thon",
  "saumon", "crevette", "poisson", "fromage", "cheddar", "mozzarella", "parmesan", "gorgonzola", "chevre", "emmental", "raclette", "tomate",
  "oignon", "champignon", "ananas", "olive", "oeuf", "creme", "basilic", "salade", "avocat", "piment", "miel", "frite",
  "maison", "artisanal", "artisanale", "frais", "fraiche", "bio", "halal", "casher", "local", "locale", "vegetarien", "vegan", "traditionnel",
  "authentique", "premium", "croustillant", "fondant", "epice", "epicee", "pane", "grille",
];

const stem = (w: string) => w.replace(/(?:s|x)$/, "");
// Un mot du nom en anglais ou en néerlandais autorise sa traduction : « cheese burger » peut devenir « burger au fromage ».
const ALIASES: [string, string][] = [["cheese", "fromage"], ["chicken", "poulet"], ["beef", "boeuf"], ["lard", "bacon"], ["veggie", "vegetarien"], ["vegan", "vegetarien"]];
// `optionKey` retire les accents mais pas les ligatures : « bœuf » deviendrait « b uf » et passerait inaperçu.
const plain = (s: string) => optionKey(s.replace(/œ/gi, "oe").replace(/æ/gi, "ae"));

/** Les mots d'ingrédient ou de promesse présents dans `text` mais absents du nom, de la catégorie et de la réponse donnée. */
export function inventedWords(text: string, source: { name: string; category?: string | null; viande?: Viande | null }): string[] {
  const allowed = new Set(plain(`${source.name} ${source.category ?? ""} ${source.viande && source.viande !== "mélange" ? source.viande : ""}`).split(" ").map(stem));
  for (const [a, b] of ALIASES) { if (allowed.has(a)) allowed.add(b); if (allowed.has(b)) allowed.add(a); }
  const claims = new Set(CLAIMS.map(stem));
  return plain(text).split(" ").map(stem).filter((w) => claims.has(w) && !allowed.has(w));
}
