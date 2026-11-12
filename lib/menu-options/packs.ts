// Le lot d'options de départ d'une famille de plats (ADR 0100). Données ÉDITORIALES écrites à la main, versionnées
// ici : jamais de prix (c'est le restaurateur qui les connaît), jamais d'allergène, rien en ligne avant sa validation.
// Une proposition à décocher, pas une réponse. Pur.

import type { GroupKind } from "./types";

export type PackChoice = {
  name: string;
  /** Coché d'office quand le client ouvre le plat (les crudités). */
  isDefault?: boolean;
  /** Ouvre une question de plus (« Ajouter des frites ? » → quelle sauce avec les frites). */
  sub?: PackGroup;
};

export type PackGroup = {
  title: string;
  kind: GroupKind;
  min: number;
  max: number | null;
  choices: PackChoice[];
  /** Nous ne sommes pas sûrs de la sorte de ce groupe : le restaurateur la confirme. */
  guess?: boolean;
};

const retrait = (names: string[]): PackGroup => ({ title: "Je le prends sans", kind: "retrait", min: 0, max: null, choices: names.map((name) => ({ name })) });

const SUPPLEMENTS_SNACK: PackGroup = { title: "Suppléments", kind: "extra", min: 0, max: 4, choices: ["Feta", "Olives", "Cheddar", "Piment"].map((name) => ({ name })) };

const CRUDITES = ["Salade", "Tomate", "Oignons"];

/** Un durum, un pain turc, un kapsalon : crudités, sauces, suppléments, et ce qu'on peut enlever. */
const SNACK: PackGroup[] = [
  { title: "Crudités", kind: "inclus", min: 0, max: null, choices: CRUDITES.map((name) => ({ name, isDefault: true })) },
  { title: "Sauces", kind: "inclus", min: 1, max: 2, choices: ["Blanche", "Harissa", "Samouraï", "Andalouse", "Ketchup"].map((name) => ({ name })) },
  SUPPLEMENTS_SNACK,
  retrait(CRUDITES),
];

const PACKS: Record<string, PackGroup[]> = {
  mitraillette: [
    { title: "Crudités", kind: "inclus", min: 0, max: null, choices: [...CRUDITES, "Carottes", "Maïs"].map((name) => ({ name, isDefault: true })) },
    { title: "Sauces", kind: "inclus", min: 1, max: 2, choices: ["Ketchup", "Andalouse", "Mayonnaise", "Samouraï", "Tartare"].map((name) => ({ name })) },
    SUPPLEMENTS_SNACK,
    {
      title: "Ajouter des frites ?", kind: "extra", min: 0, max: 1, guess: true,
      choices: [{ name: "Oui", sub: { title: "Sauce frites", kind: "inclus", min: 0, max: 1, choices: [{ name: "Ketchup" }, { name: "Mayo" }] } }],
    },
    retrait(CRUDITES),
  ],
  durum: SNACK,
  kapsalon: SNACK,
  sandwich: SNACK,
  panini: SNACK,
  tacos: [
    { title: "Viandes", kind: "inclus", min: 1, max: 2, guess: true, choices: ["Poulet", "Kefta", "Cordon bleu"].map((name) => ({ name })) },
    { title: "Sauces", kind: "inclus", min: 1, max: 2, choices: ["Algérienne", "Samouraï", "Blanche", "Fromagère"].map((name) => ({ name })) },
    { title: "Suppléments", kind: "extra", min: 0, max: 2, choices: [{ name: "Fromage" }] },
    retrait(["Frites"]),
  ],
  pizza: [
    { title: "Taille", kind: "variante", min: 1, max: 1, choices: [{ name: "26 cm", isDefault: true }, { name: "33 cm" }] },
    { title: "Suppléments", kind: "extra", min: 0, max: null, choices: ["Mozzarella", "Jambon", "Champignons", "Œuf", "Oignons rouges"].map((name) => ({ name })) },
    retrait(["Oignons"]),
  ],
  pates: [
    { title: "Type de pâtes", kind: "variante", min: 1, max: 1, choices: [{ name: "Spaghetti", isDefault: true }, { name: "Penne" }, { name: "Tagliatelle" }] },
    { title: "Suppléments", kind: "extra", min: 0, max: null, choices: ["Fromage râpé", "Poulet", "Champignons"].map((name) => ({ name })) },
    retrait(["Piment"]),
  ],
  burger: [
    { title: "Sauce", kind: "inclus", min: 0, max: 1, choices: ["Ketchup", "Mayonnaise", "Andalouse", "Samouraï", "Barbecue"].map((name) => ({ name })) },
    { title: "Suppléments", kind: "extra", min: 0, max: 5, choices: ["Cheddar", "Bacon", "Jalapeños", "Feta", "Olives"].map((name) => ({ name })) },
    retrait(["Oignons", "Cornichons", "Salade"]),
  ],
};

/** Le lot de départ d'un groupe de plats (clé de groupe, pas de famille). Vide quand nous n'avons rien de sérieux à proposer. */
export function packFor(lotKey: string): PackGroup[] {
  return PACKS[lotKey] ?? [];
}
