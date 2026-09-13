"use client";

import { useState, useTransition } from "react";
import { decideDuplicate } from "./actions";
import type { ReviewOutcome } from "@/lib/duplicate-reviews";

// Deux boutons, une décision. Volontairement sans confirmation modale : les
// deux issues sont réversibles côté « Commandes » (rejeter puis re-valider),
// et une modale de plus sur une file d'attente ralentit le seul geste utile.
export function DuplicateDecision({
  restaurantId,
  reviewId,
}: {
  restaurantId: string;
  reviewId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ReviewOutcome | null>(null);

  function decide(outcome: ReviewOutcome) {
    setError(null);
    startTransition(async () => {
      const result = await decideDuplicate(restaurantId, reviewId, outcome);
      if (result.ok) setDone(outcome);
      else setError(result.error ?? "Erreur.");
    });
  }

  if (done) {
    return (
      <p className="text-sm font-semibold text-ink-body">
        {done === "confirmed_duplicate"
          ? "Doublon confirmé — la commande a été rejetée."
          : "Deux commandes distinctes — la commande repart en file de validation."}
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => decide("confirmed_duplicate")}
          className="bg-danger text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-danger disabled:opacity-60 transition-colors"
        >
          C&apos;est le même ticket
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => decide("legit")}
          className="bg-white border border-paper-border text-ink text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-paper disabled:opacity-60 transition-colors"
        >
          Ce sont deux commandes différentes
        </button>
      </div>
      {error && <p className="text-danger text-xs mt-2">{error}</p>}
    </div>
  );
}
