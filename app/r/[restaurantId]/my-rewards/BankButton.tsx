"use client";

import { useState } from "react";
import { PiggyBank } from "lucide-react";
import { useRouter, useParams } from "next/navigation";
import { track } from "@/lib/analytics";

// ADR 0021 — « Mettre de côté » : convertit le cadeau disponible en points
// de réserve. Confirmation inline (pas de window.confirm) avec le nombre de
// points quand le montant de la commande est connu.
// `size="lg"` : version pleine largeur de l'accueil (ADR 0059), à côté de
// « Récupérer au comptoir ».
export function BankButton({ points, size = "sm" }: { points: number | null; size?: "sm" | "lg" }) {
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
        // Le nombre de points n'est pas envoyé : même courbés (ADR 0060), ils
        // restent tirés du montant du ticket (ADR 0028).
        track("reward_banked", { restaurant_id: restaurantId });
        router.push(`/r/${restaurantId}/reserve`);
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

  if (confirming && size === "lg") {
    return (
      <span className="flex flex-col gap-1.5 w-full rounded-xl bg-gray-100 p-3">
        <span className="text-sm text-gray-700 text-center">
          {points !== null ? `+${points} dans ta réserve, et ce cadeau disparaît ?` : "Mettre ce cadeau dans ta réserve ?"}
        </span>
        <span className="flex gap-2">
          <button
            onClick={handleBank}
            disabled={busy}
            className="flex-1 text-sm font-semibold text-white bg-brand-dark py-2 rounded-lg hover:bg-brand-dark/80 disabled:opacity-50 transition-colors"
          >
            {busy ? "…" : "Oui, mettre de côté"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={busy}
            className="flex-1 text-sm font-semibold text-gray-600 bg-white py-2 rounded-lg hover:text-gray-800 disabled:opacity-50"
          >
            Non
          </button>
        </span>
        {error && <span className="text-xs text-red-600 text-center">{error}</span>}
      </span>
    );
  }

  if (size === "lg") {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="w-full inline-flex items-center justify-center gap-2 text-base font-semibold text-brand-dark bg-gray-100 px-4 py-3 rounded-xl hover:bg-gray-200 transition-colors"
      >
        <PiggyBank className="w-5 h-5 shrink-0" aria-hidden="true" />
        Mettre de côté{points !== null ? ` (+${points})` : ""}
      </button>
    );
  }

  if (confirming) {
    return (
      <span className="inline-flex flex-col items-end gap-1">
        <span className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">
            {points !== null ? `+${points} dans ta réserve ?` : "Convertir en réserve ?"}
          </span>
          <button
            onClick={handleBank}
            disabled={busy}
            className="text-xs font-semibold text-white bg-brand-dark px-2.5 py-1.5 rounded-full hover:bg-brand-dark/80 disabled:opacity-50 transition-colors"
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
        {error && <span className="text-xs text-red-600">{error}</span>}
      </span>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-dark bg-gray-100 px-3 py-1.5 rounded-full hover:bg-gray-200 transition-colors"
    >
      <PiggyBank className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      Mettre de côté
    </button>
  );
}
