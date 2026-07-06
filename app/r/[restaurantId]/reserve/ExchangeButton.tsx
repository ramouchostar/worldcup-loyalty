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
    const res = await fetch("/api/points/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId, tierId }),
    });
    if (res.ok) {
      router.push(`/r/${restaurantId}/my-rewards`);
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Erreur lors de l'échange");
      setBusy(false);
    }
  }

  return (
    <div className="text-right">
      <button
        onClick={handleExchange}
        disabled={disabled || busy}
        className="text-xs font-semibold text-white bg-brand-red px-3 py-1.5 rounded-full hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {busy ? "…" : "Échanger"}
      </button>
      {error && <p className="text-xs text-red-600 mt-1 max-w-[200px]">{error}</p>}
    </div>
  );
}
