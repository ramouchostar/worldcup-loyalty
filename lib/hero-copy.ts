// Micro-copy d'encouragement pour la progression du palier solo (hero card,
// dashboard) — façon Duolingo : toujours "tu avances", jamais "il te
// manque X". Jamais de chiffre ni d'écart exposé (ADR 0028 §6, "perd le
// ~€25") — uniquement du texte qualitatif calé sur `pct` (0-100, purement
// visuel, jamais rendu tel quel au client).

// Membre sans historique (ADR fix previewAmt=0) — jamais de nom de palier
// fictif présenté comme acquis, un message d'amorçage orienté action à la
// place.
export function heroFirstScanMessage(): string {
  return "Gagne tes premiers points en scannant tes tickets";
}

// `currentItem` : nom du palier solo déjà atteint, ou null si aucun encore.
// Un pct bas juste après avoir débloqué un palier (currentItem non null)
// mérite un message différent d'un pct bas en tout début de parcours.
export function heroProgressMessage(pct: number, currentItem: string | null): string {
  if (pct >= 90) return "Un dernier scan et c'est à toi ! 🔥";
  if (pct >= 60) return "Presque là, encore un petit effort !";
  if (pct >= 30) return "Tu avances bien, continue comme ça !";
  if (currentItem) return `Tu as débloqué ${currentItem}, cap sur la suite !`;
  return "Chaque ticket scanné te rapproche du prochain cadeau.";
}

export function heroMaxTierMessage(): string {
  return "🏆 Tu as débloqué le meilleur palier, bravo !";
}
