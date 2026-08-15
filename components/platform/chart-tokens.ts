// Jetons de dataviz de la console plateforme (ADR 0033 §2).
//
// Volontairement FIXES et hors du thème Tailwind par établissement : les
// couleurs `brand-*` sont pilotées par la charte du restaurant courant
// (lib/branding.ts) — une série de données qui change de couleur selon le
// resto affiché serait illisible d'une page à l'autre.
//
// Une seule teinte de données pour toutes les séries : chaque graphique de
// cette console porte UNE mesure (activations, adhésions, commandes…), jamais
// deux séries superposées. Pas de palette catégorielle, donc pas de risque de
// confusion entre séries — et la teinte reste distincte des couleurs de statut
// (danger / warn / good), qui restent réservées aux états.

export const CHART = {
  /** Teinte des marques (barres). Contraste ≈ 5,6:1 sur blanc. */
  hue: "#3F6C8F",
  /** Même teinte, pas clair — piste d'un indicateur partiellement rempli. */
  hueSoft: "#DCE6EE",
  /** Grille, ligne de base et pistes — un pas au-dessus du fond, récessif. */
  grid: "#E2E2DC",
} as const;
