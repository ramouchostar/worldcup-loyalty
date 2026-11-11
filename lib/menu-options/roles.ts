// Le rôle d'un groupe d'options (ADR 0099) : ce que le groupe sert à choisir, quel que soit le nom que le
// restaurateur lui a donné (« Choisis ta sauce », « Sauce au choix », « Sauces »). Sert à regrouper, à proposer
// des gabarits par type d'établissement et à mesurer. Pur et testé ; une proposition, jamais une vérité.

export type OptionRole =
  | "retrait" | "taille" | "nombre_pieces" | "cuisson" | "viande" | "sauce" | "crudites" | "fromage"
  | "pain_base" | "boisson" | "accompagnement" | "dessert" | "supplement" | "menu_choix" | "autre";

const RULES: [OptionRole, RegExp][] = [
  ["retrait", /\bsans\b|retir|without|enlev|\bno [a-z]/],
  ["taille", /taille|size|format|portion|grandeur|junior|senior/],
  ["nombre_pieces", /nombre|pieces|pcs|\bpc\b|quantite/],
  ["cuisson", /cuisson/],
  ["viande", /viande|meat|proteine|protein|poulet|steak/],
  ["sauce", /sauce/],
  ["crudites", /crudit|legume|vegetable|salade|oignon/],
  ["fromage", /fromage|cheese/],
  ["pain_base", /\bpain\b|\bbase\b|\bbun\b|galette|tortilla|type de pate/],
  ["boisson", /boisson|drink|soft|canette|soda/],
  ["accompagnement", /accompagnement|\bside|frite|potatoes|garniture/],
  ["dessert", /dessert/],
  ["supplement", /supplement|extra|ajout|topping|ingredient|option|en plus/],
  ["menu_choix", /menu|formule|choisi|choix|compos|personnalis/],
];

const flat = (s: string) =>
  (s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

export function canonicalRole(title: string): OptionRole {
  const t = flat(title);
  for (const [role, rx] of RULES) if (rx.test(t)) return role;
  return "autre";
}
