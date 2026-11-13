// Ranger un article du catalogue dans une FAMILLE de plats (ADR 0100). Sert à mettre ensemble les articles qui ont
// les mêmes options et à proposer un lot de départ. Dictionnaire ÉDITORIAL écrit à la main : il ne contient aucune
// donnée copiée d'une plateforme. Une proposition, jamais une vérité : le restaurateur règle chaque groupe.
// Pur et testé.

import { optionKey } from "./normalize";

export type Family =
  | "mitraillette" | "pain_turc" | "durum" | "kapsalon" | "panini" | "sandwich" | "tacos" | "burger" | "wrap"
  | "pizza" | "pates" | "sushi" | "poke" | "wok" | "curry" | "salade" | "soupe" | "poulet_frit" | "assiette"
  | "snack_friture" | "entree" | "petit_dej" | "boulangerie"
  | "boisson" | "dessert" | "sauce" | "accompagnement"
  | "menu" | "promo" | "autre";

/**
 * Notre confiance dans les options proposées pour la famille (mesurée sur un corpus de cartes, voir l'ADR 0100) :
 *  - forte   : presque tous les restaurants proposent les mêmes choix (mitraillette, durum, pain turc, kapsalon) ;
 *  - moyenne : choix proches mais pas tous (tacos, sandwich, panini) ;
 *  - faible  : chaque restaurant fait à sa façon (pizza, pâtes, burger…) : idées à cocher, pas une réponse ;
 *  - aucune  : ces articles n'ont presque jamais d'options (boissons, desserts, sauces seules).
 */
export type Strength = "forte" | "moyenne" | "faible" | "aucune";

type Rule = [Family, RegExp];

// Vus d'abord dans le nom de la CATÉGORIE : elles décident même si le nom de l'article parle d'autre chose.
const BY_CATEGORY: Rule[] = [
  ["promo", /achete|offert|1 \+ 1|promo|deal|bon plan|gratuit/],
  ["menu", /\bmenus?\b|formule|combo|\bbox\b|\bmeal|\bduo\b|\btrio\b|\bpack\b|\bkids?\b|enfant/],
  ["boisson", /boisson|drink|\bsoft|\bbiere|\bbeer|\bvins?\b|wine|cocktail|\bjus\b|\bcafe|coffee|\bthe\b|\btea\b|smoothie|dranken|limonade|\bsodas?\b|milkshake|alcool|frisdrank|bieren|\bshakes?\b|ijsthee/],
  ["dessert", /dessert|nagerecht|sucre|sweet|glace|ice cream|patisserie|gaufre|crepe|tiramisu|brownie|cookie|cheesecake|mousse|beignet|donut|muffin|baklava|confiserie|snoep|\bijs\b|taart/],
  ["sauce", /\bsauces?\b|\bdips?\b|sauzen|\bsaus\b/],
  ["accompagnement", /accompagnement|\bsides?\b|\bfrites?\b|\bfries\b|\bfriet|\bextras?\b|supplement|garniture|bijgerecht|\bchips\b|legume/],
];

// Un nom de boisson de marque classe l'article même dans une catégorie mal nommée.
const DRINK_NAME = /\b(coca|cola|fanta|sprite|pepsi|7up|schweppes|ice tea|lipton|red ?bull|eau|water|spa|perrier|heineken|jupiler|leffe|stella|capri|sun|oasis|tonic|lait)\b/;

// Les familles de plats, par ordre de priorité : la mitraillette avant le sandwich, le burger avant le poulet…
const FOOD: Rule[] = [
  ["mitraillette", /mitraillette/],
  ["pain_turc", /pains? turcs?|turkish|lahmacun|\bpide\b/],
  ["durum", /durum|duruem|d[uü]r[uü]m|doner|shawarma|gyros|kebab/],
  ["tacos", /tacos/],
  ["panini", /panini|croque|\btoast/],
  ["burger", /burger/],
  ["wrap", /\bwraps?\b|burrito|fajita|quesadilla/],
  ["pizza", /pizza|calzone|focaccia/],
  ["pates", /\bpates?\b|pasta|spaghetti|penne|tagliatelle|lasagne|rigatoni|fusilli|ravioli|gnocchi|carbonara|bolognaise|macaroni/],
  ["sushi", /sushi|maki|sashimi|nigiri|temaki|california|uramaki|gunkan|\brolls?\b|chirashi/],
  ["poke", /\bpoke|\bbowl/],
  ["kapsalon", /kapsalon/],
  ["snack_friture", /fricandelle|frikandel|boulette|croquette|cervelas|bamix|viandel|loempia|mexicano|hot ?dog|saucisse|\bsnacks?\b|finger/],
  ["wok", /\bwok\b|noodle|nouille|ramen|udon|pad thai|riz saute|fried rice|\bbami\b|\bnasi\b|donburi|bibimbap|teriyaki|yakitori|yakisoba|katsu/],
  ["curry", /curry|tikka|masala|biryani|korma|vindaloo|tandoori|\bnaan\b|paneer/],
  ["soupe", /soupe|\bsoup|\bpho\b|\bmiso\b/],
  ["salade", /salade|salad/],
  ["sandwich", /sandwich|baguette|pistolet|\bpita\b|\bclub\b|\bsub\b|bagel|ciabatta/],
  ["poulet_frit", /nugget|\bwings?\b|tender|poulet frit|fried chicken|crispy|chicken|poulet|bucket|popcorn/],
  ["assiette", /assiette|\bplats?\b|\bplate|grillade|brochette|steak|cotelette|escalope|poisson|\bfish\b|\bribs\b|\bbbq\b|viande/],
  ["petit_dej", /breakfast|petit dej|brunch|pancake|omelette|croissant|granola|porridge|avocado/],
  ["entree", /entree|starter|voorgerecht|appetizer|mezze|hapjes|samoussa|samosa|spring roll|\bnems?\b|accras|falafel|houmous|hummus|onion rings|tapas|apero/],
  ["boulangerie", /viennoiser|\bpains?\b|boulang|broodjes?|bakkerij/],
];

// Des catégories de plateforme qui ne disent rien du plat : le nom de l'article décide seul.
const EMPTY_CATEGORY = /meilleures ventes|produits tendance|prix reduit|plus populaires|populair|nouveau|best ?seller|\btop\b|a la une|favori/;

/** La famille d'un article, d'après son nom puis sa catégorie. « autre » = nous n'avons pas su (il reste à ranger à la main). */
export function classifyArticle(article: { name: string; category?: string | null }): Family {
  let cat = optionKey(article.category ?? "");
  if (EMPTY_CATEGORY.test(cat)) cat = "";
  const name = optionKey(article.name);
  for (const [family, rx] of BY_CATEGORY) if (rx.test(cat)) return family;
  if (/^menu /.test(name)) return "menu";
  if (DRINK_NAME.test(name)) return "boisson";
  for (const [family, rx] of FOOD) if (rx.test(name)) return family;
  for (const [family, rx] of FOOD) if (rx.test(cat)) return family;
  return "autre";
}

const STRENGTH: Record<Family, Strength | null> = {
  mitraillette: "forte", pain_turc: "forte", durum: "forte", kapsalon: "forte",
  tacos: "moyenne", sandwich: "moyenne", panini: "moyenne",
  burger: "faible", wrap: "faible", pizza: "faible", pates: "faible", sushi: "faible", poke: "faible", wok: "faible",
  curry: "faible", salade: "faible", soupe: "faible", poulet_frit: "faible", assiette: "faible", snack_friture: "faible",
  entree: "faible", petit_dej: "faible", boulangerie: "faible", accompagnement: "faible",
  boisson: "aucune", dessert: "aucune", sauce: "aucune",
  // Une formule (« Menu… ») compose d'autres articles : elle demande ses propres écrans. Hors de cette étape.
  menu: null, promo: null, autre: null,
};

export const familyStrength = (family: Family): Strength | null => STRENGTH[family];

export const FAMILY_LABEL: Record<Family, string> = {
  mitraillette: "Mitraillettes", pain_turc: "Pains turcs", durum: "Durums", kapsalon: "Kapsalons", panini: "Paninis",
  sandwich: "Sandwichs", tacos: "Tacos", burger: "Burgers", wrap: "Wraps", pizza: "Pizzas", pates: "Pâtes",
  sushi: "Sushis", poke: "Poke bowls", wok: "Plats wok", curry: "Currys", salade: "Salades", soupe: "Soupes",
  poulet_frit: "Poulet et nuggets", assiette: "Assiettes", snack_friture: "Snacks", entree: "Entrées",
  petit_dej: "Petits-déjeuners", boulangerie: "Viennoiseries et pains", boisson: "Boissons", dessert: "Desserts",
  sauce: "Sauces", accompagnement: "Accompagnements", menu: "Menus", promo: "Promotions", autre: "Autres plats",
};

/**
 * Les familles qui partagent un même groupe de plats, parce que la même carte leur donne presque toujours les mêmes
 * choix (mesuré dans un même restaurant : durum et pain turc, panini et durum). Une famille sans entrée ici a son groupe.
 */
export const LOT_OF: Partial<Record<Family, string>> = {
  durum: "durum", pain_turc: "durum",
  boisson: "sans_choix", dessert: "sans_choix", sauce: "sans_choix",
};

/** Des plats « qui vont avec » un groupe sans lui appartenir d'office : proposés au restaurateur, qui garde ou retire. */
export const SUGGESTED_WITH: Partial<Record<string, Family[]>> = {
  durum: ["panini", "sandwich"],
};

/** Deux groupes dont les choix sont souvent les mêmes dans un même restaurant : on propose de les réunir. */
export const AFFINITY: { a: string; b: string; text: string }[] = [
  { a: "mitraillette", b: "durum", text: "Dans la plupart des restaurants qui vendent des mitraillettes et des durums, les deux ont les mêmes choix. Pour toi aussi ?" },
];

/** Libellé d'un groupe de plats à partir des familles qu'il réunit : « Durums, pains turcs et paninis ». */
export function joinLabels(families: Family[]): string {
  const labels = families.map((f) => FAMILY_LABEL[f]);
  if (labels.length <= 1) return labels[0] ?? "";
  const lower = labels.slice(1).map((l) => l.charAt(0).toLowerCase() + l.slice(1));
  return `${labels[0]}, ${lower.slice(0, -1).concat(`et ${lower[lower.length - 1]}`).join(", ")}`.replace(/, et /, " et ");
}
