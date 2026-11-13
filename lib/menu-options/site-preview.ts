// ADR 0100 §10 — l'aperçu du site : ce que les clients liraient, bâti sur les vrais plats, les vrais choix, les vraies
// descriptions et les allergènes CONFIRMÉS du restaurateur. Logique PURE. Le site public lui-même (ADR 0088, Brigade 15)
// n'existe pas encore : cet aperçu ne publie rien et n'en tient pas lieu ; il dit seulement si les données sont prêtes.

import type { Family } from "./families";
import { ALLERGEN_LABEL, type AllergenKey } from "./pdf";

/** Ce qui est DÉJÀ enregistré en base pour un plat. `null` partout = rien d'enregistré (ou colonnes pas encore créées). */
export type ItemFacts = { description: string | null; descriptionSource: string | null; allergens: AllergenKey[] | null };
export type FactsById = Record<string, ItemFacts>;

export type AllergenText = { text: string; confirmed: boolean };

/** Ce qui s'affiche sous un plat. Jamais « aucun » sans la confirmation du restaurateur (ADR 0099 §3, ADR 0100 §8). */
export function allergenText(allergens: AllergenKey[] | null | undefined): AllergenText {
  if (allergens === null || allergens === undefined) return { text: "Allergènes : demande-nous au comptoir", confirmed: false };
  if (allergens.length === 0) return { text: "Aucun des 14 allergènes à déclaration obligatoire", confirmed: true };
  return { text: `Contient : ${allergens.map((k) => ALLERGEN_LABEL[k].toLocaleLowerCase("fr-BE")).join(", ")}`, confirmed: true };
}

/**
 * La description que le site afficherait. Ce que le restaurateur a écrit ou repris de son PDF, déjà en base, gagne toujours.
 * Sinon, pour un groupe qu'il a validé, la nôtre (celle de l'écran, qui partira à l'enregistrement) ; sinon ce qui est déjà en base.
 */
export function siteDescription(editor: { text: string } | null, lotValidated: boolean, facts: ItemFacts | undefined): string | null {
  const saved = facts?.description && facts.description.trim() !== "" ? facts.description : null;
  if (saved && (facts?.descriptionSource === "pdf" || facts?.descriptionSource === "restaurateur")) return saved;
  if (lotValidated && editor && editor.text.trim() !== "") return editor.text;
  return saved;
}

export type PreviewItem = {
  id: string;
  name: string;
  price: number;
  hasPhoto: boolean;
  description: string | null;
  allergens: AllergenText;
  /** Combien de listes de choix le client verrait. */
  optionGroups: number;
  /** Les choix de ce plat ne sont ni enregistrés ni validés : ils ne s'afficheraient pas. */
  pending: boolean;
};

export type PreviewCategory = { name: string; items: PreviewItem[] };

/** Les plats d'un ensemble de familles qui ne passent pas par la cuisine ni n'ont d'allergène à déclarer ici. */
const NO_ALLERGEN_REVIEW: ReadonlySet<Family> = new Set<Family>(["boisson", "sauce"]);

export type PreviewInput = {
  articles: { id: string; name: string; category: string; family: Family }[];
  price: (id: string) => number;
  hasPhoto: (id: string) => boolean;
  /** Le groupe de plats validé de l'article (ou `null`), et la description d'écran correspondante. */
  lotOf: (id: string) => { validated: boolean; groups: number } | null;
  editorDescription: (id: string) => { text: string } | null;
  /** Combien de listes de choix sont DÉJÀ enregistrées pour l'article. */
  configured: Record<string, number>;
  facts: FactsById;
};

export function buildPreview(input: PreviewInput): PreviewCategory[] {
  const byCat = new Map<string, PreviewItem[]>();
  for (const a of input.articles) {
    const lot = input.lotOf(a.id);
    const saved = input.configured[a.id] ?? 0;
    const validated = !!lot?.validated;
    const groups = validated ? lot!.groups : saved;
    const item: PreviewItem = {
      id: a.id, name: a.name, price: input.price(a.id), hasPhoto: input.hasPhoto(a.id),
      description: siteDescription(input.editorDescription(a.id), validated, input.facts[a.id]),
      allergens: allergenText(input.facts[a.id]?.allergens),
      optionGroups: groups,
      // « À valider » seulement s'il y a des choix à valider : une boisson sans choix n'attend rien.
      pending: !validated && saved === 0 && !!lot && lot.groups > 0,
    };
    const cat = a.category.trim() || "Autres plats";
    byCat.set(cat, [...(byCat.get(cat) ?? []), item]);
  }
  return [...byCat.entries()].map(([name, items]) => ({ name, items }));
}

export type Check = { key: "plats" | "photos" | "choix" | "descriptions" | "allergenes"; ok: boolean; title: string; text: string };

export type ChecklistInput = {
  articles: { id: string; family: Family }[];
  items: PreviewItem[];
  lotsValidated: number;
  lotsTotal: number;
};

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/** Les cinq lignes de la liste « Ton site est-il prêt ? ». Chaque « non » dit quoi faire, jamais un reproche. */
export function checklist(input: ChecklistInput): Check[] {
  const total = input.items.length;
  const photos = input.items.filter((i) => i.hasPhoto).length;
  const described = input.items.filter((i) => i.description !== null).length;
  const reviewable = new Set(input.articles.filter((a) => !NO_ALLERGEN_REVIEW.has(a.family)).map((a) => a.id));
  const food = input.items.filter((i) => reviewable.has(i.id));
  const confirmed = food.filter((i) => i.allergens.confirmed).length;
  return [
    { key: "plats", ok: total > 0, title: "Plats et prix", text: `${plural(total, "plat", "plats")}, ceux de ton menu Boosteats.` },
    { key: "photos", ok: photos === total && total > 0, title: "Photos", text: `${photos} sur ${total}.${photos < total ? " Les autres s'affichent sans photo." : ""}` },
    { key: "choix", ok: input.lotsTotal > 0 && input.lotsValidated === input.lotsTotal, title: "Choix", text: `${input.lotsValidated} groupes de plats réglés sur ${input.lotsTotal}.` },
    { key: "descriptions", ok: described === total && total > 0, title: "Descriptions", text: `${described} sur ${total}.` },
    { key: "allergenes", ok: food.length > 0 && confirmed === food.length, title: "Allergènes", text: `${confirmed} confirmés sur ${food.length}.${confirmed < food.length ? " Les autres s'affichent « demande-nous au comptoir »." : ""}` },
  ];
}
