// Bandes de paliers standard (héritées des grilles ADR 0006).
// Le seuil structure le palier ; l'article assigné vient du catalogue (ADR 0013).
// Constantes pures (aucune dépendance serveur) → importables côté client.
export const SOLO_BANDS = [15, 25, 40, 60] as const; // montant de commande (€)
export const COMMUNITY_BANDS = [1000, 3000, 6000, 10000] as const; // score d'équipe (pts)
