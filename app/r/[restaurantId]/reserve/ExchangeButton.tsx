"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";

// ADR 0021 — échange de la réserve contre un gros cadeau. Le cadeau créé
// apparaît dans « Mes récompenses » et suit le cycle coupon existant.
export function ExchangeButton({ tierId, disabled }: { tierId: string; disabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { restaurantId } = useParams<{ restaurantId: string }>();

  async function handleExchange() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/points/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId, tierId }),
      });
      if (res.ok) {
        // Bandeau de succès sur « Mes cadeaux » (audit UX 2026-08-11).
        router.push(`/r/${restaurantId}/my-rewards?exchanged=1`);
        router.refresh();
        return;
      }
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Erreur lors de l'échange.");
    } catch {
      setError("Erreur réseau. Réessaie.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="text-right">
      <button
        onClick={handleExchange}
        disabled={disabled || busy}
        className="text-sm font-semibold text-white bg-brand-red px-5 py-3 min-h-[48px] rounded-xl hover:bg-brand-red/85 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {busy ? "Échange en cours…" : "Échanger contre ce cadeau"}
      </button>
      {error && <p className="text-sm text-red-600 mt-1 max-w-[200px]">{error}</p>}
    </div>
  );
}
