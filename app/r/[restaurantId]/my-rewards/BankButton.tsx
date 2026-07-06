"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";

// ADR 0021 — « Mettre de côté » : convertit le cadeau disponible en points
// de réserve. Confirmation inline (pas de window.confirm) avec le nombre de
// points quand le montant de la commande est connu.
export function BankButton({ points }: { points: number | null }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { restaurantId } = useParams<{ restaurantId: string }>();

  async function handleBank() {
    setBusy(true);
    const res = await fetch("/api/points/bank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId }),
    });
    if (res.ok) {
      router.push(`/r/${restaurantId}/reserve`);
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? "Erreur lors de la mise de côté");
      setBusy(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <span className="flex items-center gap-1.5">
        <span className="text-xs text-gray-500">
          {points !== null ? `+${points} dans ta réserve ?` : "Convertir en réserve ?"}
        </span>
        <button
          onClick={handleBank}
          disabled={busy}
          className="text-xs font-semibold text-white bg-brand-dark px-2.5 py-1.5 rounded-full hover:bg-gray-700 disabled:opacity-50 transition-colors"
        >
          {busy ? "…" : "Oui"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={busy}
          className="text-xs font-semibold text-gray-500 px-2 py-1.5 rounded-full hover:text-gray-700 disabled:opacity-50"
        >
          Non
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="text-xs font-semibold text-brand-dark bg-gray-100 px-3 py-1.5 rounded-full hover:bg-gray-200 transition-colors"
    >
      💰 Mettre de côté
    </button>
  );
}
