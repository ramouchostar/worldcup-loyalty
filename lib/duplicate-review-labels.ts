// Libellés des règles de dédoublonnage (ADR 0052) — dans leur propre module,
// sans dépendance serveur.
//
// `lib/duplicate-reviews.ts` importe `createAdminClient` (donc `next/headers`)
// : tout composant CLIENT qui y prend une valeur d'exécution y entraîne le
// client Supabase serveur et casse le build. L'onglet « Doublons » de
// Commandes est un composant client — il lit ces libellés ici.
export const RULE_LABELS: Record<string, string> = {
  same_order_number: "Numéro de ticket identique",
  fingerprint_time: "Même contenu, même heure",
  fingerprint_same_day: "Même contenu, même jour",
  fingerprint_number_confusion: "Même contenu, numéro mal lu",
  same_user_time_amount: "Même membre, même heure et même montant",
  image_phash: "Photos quasi identiques",
  image_phash_far: "Photos ressemblantes",
  cross_user_fingerprint: "Contenu identique, deux membres différents",
  near_fingerprint: "Contenu presque identique",
};
