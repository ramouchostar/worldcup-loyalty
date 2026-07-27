"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";

export function RedeemButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { restaurantId } = useParams<{ restaurantId: string }>();

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/redemption/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.token) { router.push(`/coupon/${body.token}`); return; }
      setError(body.error ?? "Erreur lors de la génération du coupon.");
    } catch {
      setError("Erreur réseau. Réessaie.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        onClick={handleClick}
        disabled={busy}
        className="text-xs font-semibold text-white bg-brand-red px-3 py-1.5 rounded-full hover:bg-red-700 disabled:opacity-50 transition-colors"
      >
        {busy ? "…" : "🎁 Récupérer"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
