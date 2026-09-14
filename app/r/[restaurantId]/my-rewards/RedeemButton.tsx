"use client";

import { useState } from "react";
import { Gift } from "lucide-react";
import { useRouter, useParams } from "next/navigation";
import { track } from "@/lib/analytics";

// `size="lg"` : version pleine largeur de l'accueil (ADR 0059), où le choix
// récupérer / mettre de côté est le geste principal de l'écran.
export function RedeemButton({ size = "sm" }: { size?: "sm" | "lg" } = {}) {
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
      if (res.ok && body.token) {
        track("reward_redeem_started", { restaurant_id: restaurantId });
        router.push(`/coupon/${body.token}`);
        return;
      }
      setError(body.error ?? "Erreur lors de la génération du coupon.");
      // 410 = fenêtre de 48 h passée, la ligne vient d'être close côté serveur
      // (ADR 0011). On rafraîchit pour que la carte rejoigne « Expirées » au
      // lieu de garder un bouton « Récupérer » qui ne peut plus rien faire.
      if (res.status === 410) router.refresh();
    } catch {
      setError("Erreur réseau. Réessaie.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className={size === "lg" ? "flex flex-col gap-1 w-full" : "inline-flex flex-col items-end gap-1"}>
      <button
        onClick={handleClick}
        disabled={busy}
        className={
          size === "lg"
            ? "w-full inline-flex items-center justify-center gap-2 text-base font-bold text-white bg-brand-red px-4 py-3 rounded-xl hover:bg-brand-red/85 disabled:opacity-50 transition-colors"
            : "inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-brand-red px-3 py-1.5 rounded-full hover:bg-brand-red/85 disabled:opacity-50 transition-colors"
        }
      >
        {busy ? (
          "…"
        ) : (
          <>
            <Gift className={size === "lg" ? "w-5 h-5 shrink-0" : "w-3.5 h-3.5 shrink-0"} aria-hidden="true" />
            {size === "lg" ? "Récupérer au comptoir" : "Récupérer"}
          </>
        )}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
