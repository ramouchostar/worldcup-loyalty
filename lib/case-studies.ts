// Cas clients publiés sur le site. Accord du propriétaire donné le 2026-11-02
// (Aram, Belchicken Kraainem) pour le nom et les chiffres. Aucune citation tant
// qu'il n'en a pas donné une : n'en inventer aucune. Formulation : ce qu'on a
// fait ENSEMBLE, jamais « grâce à nous » (ADR 0064).
export const KRAAINEM_CASE = {
  restaurant: "Belchicken Kraainem",
  since: "client depuis plus d'un an",
  before: 63_000,
  after: 123_000,
  headline: "De 63 000 € à 123 000 € de chiffre d'affaires par mois",
  intro: "Restauration rapide à Kraainem. Le programme de fidélité est en place depuis le premier jour, et on construit le reste avec le propriétaire, mois après mois.",
  actions: [
    "Des milliers de clients inscrits, relancés chaque semaine avec de nouvelles promos et de nouveaux cadeaux à gagner.",
    "Le chiffre d'affaires lu jour par jour : les jours qui marchent, ceux à améliorer, et ce qui les fait bouger.",
    "Les bonnes promos au bon moment, sur les plateformes mais surtout pour remplir la salle.",
    "De la pub dans le quartier toute l'année, avec un budget de 800 à 1 000 € par mois.",
  ],
} as const;

export const euros = (n: number) => `${n.toLocaleString("fr-BE")} €`;
