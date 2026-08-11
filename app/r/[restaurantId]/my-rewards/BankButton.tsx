"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";

// ADR 0021 — « Mettre de côté » : convertit le cadeau disponible en points
// de réserve. Confirmation inline (pas de window.confirm) avec le nombre de
// points quand le montant de la commande est connu.
export function BankButton({ points }: { points: number | null }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { restaurantId } = useParams<{ restaurantId: string }>();

  async function handleBank() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/points/bank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId }),
      });
      if (res.ok) {
        // Bandeau de succès sur la page réserve (audit UX 2026-08-11) —
        // le nombre s'affiche sans le mot « points » (ADR 0021).
        router.push(`/r/${restaurantId}/reserve?banked=${points ?? 0}`);
        router.refresh();
        return;
      }
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Erreur lors de la mise de côté.");
    } catch {
      setError("Erreur réseau. Réessaie.");
    } finally {
      setBusy(false);
    }
  }

  if (confirming) {
    return (
      <span className="inline-flex flex-col items-end gap-2">
        <span className="text-sm text-gray-500">
          {points !== null ? `+${points} dans ta réserve ?` : "Mettre ce cadeau de côté ?"}
        </span>
        <span className="flex items-center gap-3">
          <button
            onClick={handleBank}
            disabled={busy}
            className="text-sm font-semibold text-white bg-brand-dark px-4 py-3 min-h-[44px] rounded-xl hover:bg-brand-dark/80 disabled:opacity-50 transition-colors"
          >
            {busy ? "…" : "Oui, mettre de côté"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={busy}
            className="text-sm font-semibold text-gray-700 bg-gray-100 px-4 py-3 min-h-[44px] rounded-xl hover:bg-gray-200 disabled:opacity-50 transition-colors"
          >
            Non, garder le cadeau
          </button>
        </span>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </span>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="text-sm font-semibold text-brand-dark bg-gray-100 px-5 py-3 min-h-[48px] rounded-xl hover:bg-gray-200 transition-colors"
    >
      💰 Mettre de côté
    </button>
  );
}
