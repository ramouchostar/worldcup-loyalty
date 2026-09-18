"use client";

import { useEffect, useState } from "react";
import { Clock, Gift, ShoppingBag, Store, Timer } from "lucide-react";
import { useRouter, useParams } from "next/navigation";
import { track } from "@/lib/analytics";
import { REDEMPTION_MIN_ORDER_EUR, formatOpensAt } from "@/lib/reward-window";

// `size="lg"` : version pleine largeur de l'accueil (ADR 0059), où le choix
// récupérer / mettre de côté est le geste principal de l'écran.
//
// `opensAt` (ADR 0011 amendé, terrain Houba 2026-09-17) : un cadeau né d'un
// ticket ne se récupère pas pendant la même visite. Avant cette heure, le
// bouton dit quand revenir ; il s'active tout seul à l'heure dite. Le serveur
// refuse de toute façon (425) — l'écran ne fait que le dire avant.
// `rewardId` (ADR 0061 §7) : un cadeau d'équipe peut attendre à côté du cadeau
// personnel — le bouton dit lequel il récupère.
//
// Confirmation avant le minuteur (terrain Houba, 2026-09-18) : une cliente a
// touché « Récupérer » sans le vouloir, le coupon de 10 minutes s'est ouvert
// et son cadeau était consommé. Le bouton ouvre d'abord une fenêtre qui dit
// quoi faire (au comptoir, 10 € minimum, 10 minutes) ; seul « Je suis au
// comptoir » génère le coupon. « Pas maintenant » ne consomme rien.
export function RedeemButton({
  size = "sm",
  opensAt = null,
  rewardId = null,
  itemName = null,
}: { size?: "sm" | "lg"; opensAt?: string | null; rewardId?: string | null; itemName?: string | null } = {}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const router = useRouter();
  const { restaurantId } = useParams<{ restaurantId: string }>();

  const opensMs = opensAt ? new Date(opensAt).getTime() : NaN;
  const locked = Number.isFinite(opensMs) && opensMs > now;

  useEffect(() => {
    if (!locked) return;
    // Plafonné : setTimeout déborde au-delà de ~24,8 jours.
    const wait = Math.min(opensMs - Date.now() + 500, 2_000_000_000);
    const id = window.setTimeout(() => setNow(Date.now()), Math.max(wait, 0));
    return () => window.clearTimeout(id);
  }, [locked, opensMs]);

  useEffect(() => {
    if (!confirming) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirming]);

  function openConfirmation() {
    setError(null);
    setConfirming(true);
    track("reward_redeem_confirm_shown", { restaurant_id: restaurantId });
  }

  function dismiss() {
    setConfirming(false);
    track("reward_redeem_dismissed", { restaurant_id: restaurantId });
  }

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/redemption/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId, rewardId }),
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

  if (locked) {
    const when = formatOpensAt(new Date(opensMs), new Date(now));
    return (
      <span className={size === "lg" ? "flex flex-col gap-1 w-full" : "inline-flex flex-col items-end gap-1"}>
        <span
          aria-disabled="true"
          className={
            size === "lg"
              ? "w-full inline-flex items-center justify-center gap-2 text-base font-bold text-gray-600 bg-white border-2 border-gray-200 px-4 py-3 rounded-xl"
              : "inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 bg-gray-100 px-3 py-1.5 rounded-full"
          }
        >
          <Clock className={size === "lg" ? "w-5 h-5 shrink-0" : "w-3.5 h-3.5 shrink-0"} aria-hidden="true" />
          {size === "lg" ? `Récupérable dès ${when.replace(/^à /, "")}` : `Dès ${when.replace(/^à /, "")}`}
        </span>
      </span>
    );
  }

  return (
    <span className={size === "lg" ? "flex flex-col gap-1 w-full" : "inline-flex flex-col items-end gap-1"}>
      <button
        onClick={openConfirmation}
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

      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
          onClick={dismiss}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="redeem-confirm-title"
            className="w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-6 pb-8 shadow-2xl text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center">
              <span className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center">
                <Gift className="w-7 h-7 text-green-700" aria-hidden="true" />
              </span>
              <h2 id="redeem-confirm-title" className="text-xl font-black text-gray-900 mt-3">
                {itemName ? `Récupérer ${itemName} ?` : "Récupérer ton cadeau ?"}
              </h2>
            </div>
            <ul className="mt-5 space-y-3 text-sm text-gray-800">
              <li className="flex items-start gap-3">
                <Store className="w-5 h-5 shrink-0 text-gray-500 mt-0.5" aria-hidden="true" />
                <span>À faire <span className="font-semibold">au comptoir</span>, devant le caissier.</span>
              </li>
              <li className="flex items-start gap-3">
                <ShoppingBag className="w-5 h-5 shrink-0 text-gray-500 mt-0.5" aria-hidden="true" />
                <span>Avec une commande d&apos;au moins <span className="font-semibold">{REDEMPTION_MIN_ORDER_EUR} €</span>.</span>
              </li>
              <li className="flex items-start gap-3">
                <Timer className="w-5 h-5 shrink-0 text-gray-500 mt-0.5" aria-hidden="true" />
                <span>Ton coupon s&apos;affiche pour <span className="font-semibold">10 minutes</span> : montre-le tout de suite.</span>
              </li>
            </ul>
            <button
              type="button"
              autoFocus
              onClick={() => {
                setConfirming(false);
                void handleClick();
              }}
              className="mt-6 w-full bg-brand-red text-white font-bold text-base py-3.5 rounded-xl hover:bg-brand-red/85 transition-colors"
            >
              Je suis au comptoir — afficher mon coupon
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="mt-2 w-full text-sm font-semibold text-gray-600 py-2.5 rounded-xl hover:bg-gray-50"
            >
              Pas maintenant
            </button>
          </div>
        </div>
      )}
    </span>
  );
}
