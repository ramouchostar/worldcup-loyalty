// Les options d'un article du catalogue (ADR 0099, proposé) : ce que le client choisit en plus de l'article.
// Types purs, importables partout (composants client compris). Aucun accès base ici.
//
// Vocabulaire (CONTEXT.md) : un ARTICLE (menu_items) a des GROUPES d'options ; un groupe propose des CHOIX ;
// un choix vient de la BIBLIOTHÈQUE d'options de l'établissement (la sauce « Samouraï » existe une fois, ses prix
// vivent dans chaque groupe qui la propose) ; un choix peut ouvrir des SOUS-GROUPES (un menu dont on choisit les
// frites, puis la boisson de ces frites).

/**
 * Quatre sortes de groupes, observées sur des cartes de six cuisines :
 *  - inclus   : compris dans le prix (la boisson du menu, la sauce au choix). Peut être facultatif.
 *  - variante : on choisit UNE valeur qui remplace la base (taille, type de pâtes), souvent avec un supplément.
 *  - extra    : suppléments payants, l'upsell (sauce en plus, fromage, accompagnement).
 *  - retrait  : « je le prends sans… » : retire un ingrédient, toujours à 0 €, imprimé en gros sur le ticket.
 */
export type GroupKind = "inclus" | "variante" | "extra" | "retrait";

export const GROUP_KINDS: readonly GroupKind[] = ["inclus", "variante", "extra", "retrait"];

export type OptionChoice = {
  id: string;
  /** Id dans la bibliothèque d'options de l'établissement. */
  libraryId: string;
  name: string;
  /** Supplément en euros, jamais négatif. 0 pour une option comprise. */
  priceDelta: number;
  /** Combien de fois la même option peut être prise (1 = case à cocher). */
  maxQty: number;
  /** Cochée d'office quand le groupe s'ouvre. Décochée sur un groupe « inclus », elle s'imprime « SANS ». */
  isDefault: boolean;
  /** Rupture : l'option disparaît de la commande sans toucher au reste. */
  isAvailable: boolean;
  /** Sous-groupes qui s'ouvrent quand ce choix est pris. */
  groups: OptionGroup[];
};

export type OptionGroup = {
  id: string;
  title: string;
  kind: GroupKind;
  /** Nombre total de sélections (quantités comprises) au moins demandé. 0 = facultatif. */
  min: number;
  /** Au plus. `null` = sans limite. */
  max: number | null;
  choices: OptionChoice[];
};

/**
 * Ce que le client a choisi. Clé = chemin du groupe : l'id du groupe à la racine, puis
 * `<chemin du parent>><id du choix>><id du groupe>` pour un sous-groupe (le même groupe réutilisé sous deux
 * choix a donc deux chemins distincts). Valeur = quantité par id de choix.
 */
export type Selection = Record<string, Record<string, number>>;

/** Une ligne lisible de ce que le client a choisi : panier, ticket de cuisine, suivi. */
export type SelectionLine = {
  kind: "inclus" | "extra" | "sans";
  group: string;
  name: string;
  qty: number;
  /** Supplément total de la ligne, en centimes. */
  cents: number;
};
