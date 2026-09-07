// Illustration de plat pour un nom de cadeau/article (backlog « Favicon des
// plats », 2026-09-07). Un cadeau nommé mérite mieux qu'un 🎁 générique : le
// burger gagné s'affiche en GRAND, appétissant — Fluent Emoji 3D, le langage
// visuel déjà utilisé partout (pièce, ticket, reçu — lib/fluent-emoji.ts).
//
// Même philosophie que les mots-clés saisonniers (lib/insights.ts, ADR 0022) :
// correspondance déterministe par mots-clés, listes volontairement prudentes —
// un raté affiche le cadeau générique 🎁, JAMAIS un contresens. Premier mot-clé
// qui matche gagne : les catégories spécifiques passent avant les génériques
// (« BelTacos Tenders » est un taco avant d'être du poulet).
import { FLUENT_EMOJI_3D } from "./fluent-emoji";

const normalize = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// [mots-clés, codepoint Fluent Emoji 3D] — l'ordre est le tri de priorité.
const FOOD_KEYWORDS: [string[], string][] = [
  [["taco"], "1f32e"],
  [["wrap", "durum", "kebab", "shawarma", "burrito"], "1f32f"],
  [["burger", "beef", "smash"], "1f354"],
  [["frite", "fries", "friet"], "1f35f"],
  [["pizza"], "1f355"],
  [["pasta", "pates", "pate", "spaghetti", "penne", "tagliatelle", "lasagn"], "1f35d"],
  [["sushi", "maki", "nigiri", "california"], "1f363"],
  [["ramen", "noodle", "nouille", "wok"], "1f35c"],
  [["riz", "rice", "bowl"], "1f35a"],
  [["curry"], "1f35b"],
  [["brochette", "skewer", "yakitori"], "1f362"],
  [["hotdog", "hot-dog", "hot dog"], "1f32d"],
  [["bucket", "poulet", "chicken", "kip", "nugget", "tender", "wing", "cuisse", "drumstick"], "1f357"],
  [["sandwich", "panini"], "1f96a"],
  [["salade", "salad"], "1f957"],
  [["crevette", "shrimp", "scampi", "calamar"], "1f364"],
  [["churros", "gaufre", "waffle", "pancake", "crepe"], "1f9c7"],
  [["donut", "doughnut", "beignet"], "1f369"],
  [["cookie"], "1f36a"],
  [["glace", "ice cream", "sundae", "sorbet"], "1f366"],
  [["milkshake", "smoothie", "bubble"], "1f9cb"],
  [["dessert", "brownie", "tiramisu", "muffin", "cake", "gateau"], "1f9c1"],
  [["cafe", "coffee", "espresso", "cappuccino"], "2615"],
  [["cola", "pepsi", "fanta", "sprite", "7up", "oasis", "capri", "soda", "limonade", "ice tea", "icetea", "boisson", "drink"], "1f964"],
];

// Cadeau générique — aussi le repli des noms inconnus (« Cadeau surprise »).
export const GIFT_FALLBACK_CODEPOINT = "1f381";

/** Codepoint Fluent Emoji du plat, ou le cadeau 🎁 si rien ne matche. */
export function foodIconCodepoint(name: string | null | undefined): string {
  if (!name) return GIFT_FALLBACK_CODEPOINT;
  const hay = normalize(name);
  for (const [words, codepoint] of FOOD_KEYWORDS) {
    if (words.some((w) => hay.includes(w))) return codepoint;
  }
  return GIFT_FALLBACK_CODEPOINT;
}

/** URL de l'illustration 3D (webp, jsDelivr — déjà en img-src de la CSP). */
export function foodIconUrl(name: string | null | undefined): string {
  return `${FLUENT_EMOJI_3D}/${foodIconCodepoint(name)}.webp`;
}
