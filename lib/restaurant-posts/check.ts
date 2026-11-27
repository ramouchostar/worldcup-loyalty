// ADR 0111 §7 — le CONTRÔLE avant publication. Joué sur le serveur, PUR et testé. Il refuse et explique : un prix écrit
// dans le texte, un lien, un e-mail ou un téléphone, un champ [à remplir], une promesse de santé ou d'allergène, du
// code HTML, et un article incomplet. Une liste de mots NE VOIT PAS TOUT : ce n'est pas une garantie, le restaurant
// répond de ce qu'il publie.

import type { PostBlock, PostContent } from "./types";

export type IssueCode =
  | "titre_manquant"
  | "article_vide"
  | "bloc_vide"
  | "photo_sans_description"
  | "photo_absente"
  | "plat_non_choisi"
  | "plat_absent"
  | "carte_illisible"
  | "champ_a_remplir"
  | "prix"
  | "lien"
  | "email"
  | "telephone"
  | "html"
  | "allergene"
  | "sante";

/** `block` : le rang du bloc (à partir de 0), `null` = le titre ou l'article entier. */
export type Issue = { code: IssueCode; message: string; block: number | null };

// ─── Les motifs ──────────────────────────────────────────────────────────────

/** Minuscules sans accents, caractère pour caractère : la position trouvée vaut aussi dans le texte d'origine. */
function fold(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "’" || c === "‘") out += "'";
    else out += (c.normalize("NFD")[0] ?? c).toLowerCase()[0] ?? c;
  }
  return out;
}

const UNIT_AFTER = "(?!\\s*(?:kg|g|gr|l|cl|ml|m|km|%|h|ans?)\\b)";

const PRICE: RegExp[] = [
  /\d{1,4}(?:[.,]\d{1,2})?\s*(?:€\s*\d{0,2}|(?:eur|euros?)\b)/,
  /€\s*\d{1,4}(?:[.,]\d{1,2})?/,
  /\b(?:un|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingt|trente|quarante|cinquante|soixante|cent|mille)[\s-]+euros?\b/,
  new RegExp(`\\b(?:a|pour|des|seulement|prix)\\s*:?\\s*\\d{1,3},\\d{2}(?!\\d)${UNIT_AFTER}`),
  /€/,
];

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/;
const LINK: RegExp[] = [
  /\bhttps?:\/\/\S+/,
  /\bwww\.[a-z0-9-]\S*/,
  /\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:be|com|fr|eu|net|org|nl|io|me|ly|gg|de|lu|info|shop|store|app|brussels)\b(?:\/\S*)?/,
];
/** Une vraie date (jour et mois possibles), pas les derniers chiffres d'un numéro (« 0470/12.34.56 »). */
const DATE = /(?<![\d./-])(?:0?[1-9]|[12]\d|3[01])[./-](?:0?[1-9]|1[0-2])[./-](?:(?:19|20)\d{2}|\d{2})(?!\d)/g;
/** Des horaires à la suite (« 09.00 - 22.00 / 12.00 - 23.00 ») ne font pas un numéro. */
const TIME = /(?<![\d./])(?:[01]?\d|2[0-4])[.:h][0-5]\d(?!\d|[./]\d)/g;
const PHONE = /(?<![\d,])(?:\+\s?\d|0)(?:[\s./()-]{0,3}\d){7,14}/g;
const PLACEHOLDER = /\[[^[\]]*\]/;
const HTML = /<\/?[a-z][a-z0-9-]*(?:\s[^<>]*)?\/?>|&(?:[a-z]+|#\d+);/;

const ALLERGENS =
  "gluten|lactose|allergenes?|noix|noisettes?|amandes?|arachides?|cacahuetes?|oeufs?|œufs?|lait|soja|sesame|fruits?\\s+a\\s+coques?|crustaces?|mollusques?|poissons?|moutarde|celeri|sulfites?|lupin|ble";

const ALLERGEN_CLAIMS: RegExp[] = [
  new RegExp(`\\bsans[\\s-]+(?:aucune?\\s+)?(?:traces?\\s+(?:de\\s+|d')?)?(?:${ALLERGENS})\\b`),
  new RegExp(`\\bne\\s+contien(?:t|nent)\\s+(?:pas\\s+(?:de\\s+|d')|aucune?\\s+(?:traces?\\s+(?:de\\s+|d')?)?)(?:${ALLERGENS})\\b`),
  new RegExp(`\\b(?:zero|0)\\s*%?\\s*(?:de\\s+)?(?:gluten|lactose)\\b`),
  /\b(?:gluten|lactose|nut|dairy)[\s-]*free\b/,
  /\baucun\s+allergene\w*/,
  /\bhypo[\s-]?allergen\w*/,
  /\b(?:coeliaques?|cœliaques?|allergiques?|intolerante?s?)\b/,
];

const HEALTH_CLAIMS: RegExp[] = [
  /\b(?:bon(?:ne)?s?\s+)?pour\s+(?:la|ta|votre|leur|sa|notre|une\s+bonne)\s+sante\b/,
  /\b(?:bienfaits?|benefique)\w*(?:\s+pour\s+\w+){0,2}/,
  /\b(?:plat|menu|option|formule|bowl|salade|recette|choix)\s+sante\b/,
  /\bbon(?:ne)?s?\s+pour\s+le\s+(?:coeur|cœur)\b/,
  /\b(?:minceur|maigrir|mincir|amaigrissante?s?)\b/,
  /\b(?:perdre|perte)\s+(?:de\s+|du\s+)?poids\b/,
  /\bbrule[\s-]*graisses?\b/,
  /\bdetox\w*/,
  /\bregimes?\b/,
  /\bdietetiques?\b/,
  /\bcholesterol\b/,
  /\bdiabet(?:e|ique)s?\b/,
  /\b(?:immunite|immunitaires?)\b/,
  /\bantioxydante?s?\b/,
  /\bvertus\b/,
  /\b(?:sain|saine|sains|saines|healthy)\b/,
  /\ballege(?:e|es|s)?\b/,
  /\bsans[\s-]+sucres?(?:\s+ajoutes?)?\b/,
  /\b(?:faible|pauvre|riche)s?\s+en\s+(?:calories?|graisses?|sucres?|sel|proteines?|fibres?|vitamines?|omega)\b/,
];

const first = (patterns: RegExp[], s: string): { index: number; length: number } | null => {
  for (const re of patterns) {
    const m = re.exec(s);
    if (m) return { index: m.index, length: m[0].length };
  }
  return null;
};

const blank = (s: string, re: RegExp) => s.replace(re, (m) => " ".repeat(m.length));

function phoneIn(s: string): { index: number; length: number } | null {
  for (const m of blank(blank(s, DATE), TIME).matchAll(PHONE)) {
    if (m[0].replace(/\D/g, "").length >= 9) return { index: m.index ?? 0, length: m[0].length };
  }
  return null;
}

/** Les problèmes d'UN morceau de texte. L'ordre compte : une adresse e-mail n'est pas aussi signalée comme un lien. */
export function checkText(raw: string, block: number | null): Issue[] {
  const source = raw.normalize("NFKC");
  let s = fold(source);
  const out: Issue[] = [];
  const quote = (m: { index: number; length: number }) => `« ${source.slice(m.index, m.index + m.length).trim().replace(/[.,;:!?]+$/, "")} »`;
  const add = (code: IssueCode, message: string) => out.push({ code, message, block });

  const field = first([PLACEHOLDER], s);
  if (field) {
    add("champ_a_remplir", `Il reste un champ à remplir : ${source.slice(field.index, field.index + field.length)}.`);
    s = blank(s, /\[[^[\]]*\]/g); // ce qui est entre crochets n'est pas encore du texte
  }
  const html = first([HTML], s);
  if (html) add("html", `${quote(html)} ressemble à du code. Les articles sont en texte simple.`);
  const mail = first([EMAIL], s);
  if (mail) {
    add("email", `${quote(mail)} est une adresse e-mail. Retire-la.`);
    s = blank(s, new RegExp(EMAIL.source, "g"));
  }
  const link = first(LINK, s);
  if (link) add("lien", `${quote(link)} est un lien. Les articles n'ont pas de lien : retire-le.`);
  const phone = phoneIn(s);
  if (phone) add("telephone", `${quote(phone)} est un numéro de téléphone. Retire-le.`);
  const price = first(PRICE, s);
  if (price) add("prix", `${quote(price)} est un prix écrit dans le texte. Retire-le et ajoute un bloc « Plat de la carte » : le prix vient alors de ta carte.`);
  const allergen = first(ALLERGEN_CLAIMS, s);
  if (allergen) add("allergene", `${quote(allergen)} est une promesse sur les allergènes. Retire-la : les allergènes se confirment sur la carte.`);
  const health = first(HEALTH_CLAIMS, s);
  // « sans sucre » ou « sans lait » : une phrase déjà refusée pour les allergènes ne l'est pas deux fois au même endroit.
  if (health && !(allergen && health.index === allergen.index)) add("sante", `${quote(health)} est une promesse de santé. Retire-la : un article ne peut pas en faire.`);
  return out;
}

// ─── L'article entier ────────────────────────────────────────────────────────

const EMPTY_BLOCK: Record<"p" | "h2" | "ul", string> = {
  p: "Un paragraphe est vide : écris-le ou retire-le.",
  h2: "Un intertitre est vide : écris-le ou retire-le.",
  ul: "Une liste est vide : écris un point ou retire-la.",
};

const textsOf = (b: PostBlock): string[] => (b.type === "p" || b.type === "h2" ? [b.text] : b.type === "ul" ? b.items : b.type === "photo" ? [b.alt] : []);

/**
 * Tout ce qui empêche « Oui, publier ». Liste vide = l'article peut partir.
 * `dishIds` : les plats proposés à la commande AUJOURD'HUI ; `null` = la carte n'a pas pu être lue.
 */
export function checkPublication(content: PostContent, dishIds: ReadonlySet<string> | null): Issue[] {
  const out: Issue[] = [];
  if (content.title.trim() === "") out.push({ code: "titre_manquant", message: "Ton article n'a pas de titre.", block: null });
  else out.push(...checkText(content.title, null));

  let filled = 0;
  content.blocks.forEach((b, i) => {
    if (b.type === "p" || b.type === "h2" || b.type === "ul") {
      const empty = b.type === "ul" ? b.items.every((x) => x.trim() === "") : b.text.trim() === "";
      if (empty) out.push({ code: "bloc_vide", message: EMPTY_BLOCK[b.type], block: i });
      else filled++;
    } else if (b.type === "photo") {
      filled++;
      if (b.alt.trim() === "") out.push({ code: "photo_sans_description", message: "Dis en quelques mots ce qu'on voit sur chaque photo.", block: i });
    } else {
      filled++;
      if (b.itemId === "") out.push({ code: "plat_non_choisi", message: "Un bloc « Plat de la carte » n'a pas de plat : choisis-en un ou retire-le.", block: i });
      else if (dishIds === null) out.push({ code: "carte_illisible", message: "La carte n'a pas pu être lue : impossible de vérifier tes plats. Réessaie dans un instant.", block: i });
      else if (!dishIds.has(b.itemId)) out.push({ code: "plat_absent", message: "Un plat choisi n'est plus proposé à la commande : choisis-en un autre ou retire le bloc.", block: i });
    }
    for (const t of textsOf(b)) out.push(...checkText(t, i));
  });
  if (filled === 0 && !out.some((x) => x.code === "bloc_vide")) out.push({ code: "article_vide", message: "Ton article est vide : ajoute au moins un paragraphe.", block: null });

  // La même phrase n'est dite qu'une fois.
  return out.filter((x, i) => out.findIndex((y) => y.message === x.message) === i);
}
