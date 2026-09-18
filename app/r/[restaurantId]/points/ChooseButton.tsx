"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { track } from "@/lib/analytics";

// ADR 0061 — choisir un cadeau du catalogue avec ses points. Confirmation en
// place (pas de window.confirm) : l'échange débite des points, un mauvais
// tap coûterait cher. Le cadeau créé apparaît dans « Mes cadeaux » et suit le
// cycle coupon existant (ADR 0011).
export function ChooseButton({
  itemId,
  itemName,
  price,
  disabled = false,
  size = "sm",
}: {
  itemId: string;
  itemName: string;
  price: number;
  disabled?: boolean;
  size?: "sm" | "lg";
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { restaurantId } = useParams<{ restaurantId: string }>();

  async function handleChoose() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/points/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId, itemId }),
      });
      if (res.ok) {
        track("points_gift_chosen", { restaurant_id: restaurantId });
        router.push(`/r/${restaurantId}/my-rewards`);
        router.refresh();
        return;
      }
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Erreur lors de l'échange.");
      setConfirming(false);
    } catch {
      setError("Erreur réseau. Réessaie.");
    } finally {
      setBusy(false);
    }
  }

  const base = size === "lg" ? "text-sm px-4 py-2 rounded-xl" : "text-xs px-3 py-1.5 rounded-full";

  if (confirming) {
    return (
      <span className="flex flex-col gap-1.5 w-full rounded-xl bg-gray-50 border border-gray-200 p-2">
        <span className="text-xs text-gray-700 text-center">
          {price.toLocaleString("fr-BE")} points pour {itemName} ?
        </span>
        <span className="flex gap-1.5">
          <button
            onClick={handleChoose}
            disabled={busy}
            className="flex-1 text-xs font-semibold text-white bg-brand-red py-1.5 rounded-lg hover:bg-brand-red/85 disabled:opacity-50 transition-colors"
          >
            {busy ? "…" : "Oui"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={busy}
            className="flex-1 text-xs font-semibold text-gray-600 bg-white border border-gray-200 py-1.5 rounded-lg hover:text-gray-800 disabled:opacity-50"
          >
            Non
          </button>
        </span>
      </span>
    );
  }

  return (
    <span className="flex flex-col items-stretch gap-1">
      <button
        onClick={() => setConfirming(true)}
        disabled={disabled}
        className={`${base} font-semibold text-white bg-brand-red hover:bg-brand-red/85 disabled:opacity-40 disabled:cursor-not-allowed transition-colors`}
      >
        Choisir
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
