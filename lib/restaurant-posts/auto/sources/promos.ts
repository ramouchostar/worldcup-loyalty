// ADR 0112 — la source des promos. Les offres (ADR 0110) ne sont pas construites : le contrat est posé (`PromoFacts`,
// `OccasionSource`), l'implémentation est VIDE. À brancher : `read` rend une occasion par offre active (ses jours
// possibles, sa fin), `recheck` dit si l'offre est toujours active.

import type { OccasionSource } from "./types";

export const PROMOS_UNAVAILABLE = "les offres (ADR 0110) ne sont pas construites";

export const promoSource: OccasionSource = {
  kind: "promo",
  unavailable: () => PROMOS_UNAVAILABLE,
  read: async () => ({ ok: true, candidates: [] }),
  recheck: async () => ({ ok: false, reason: "promo_finie" }),
};
