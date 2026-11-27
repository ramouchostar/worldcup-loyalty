"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { readJsonSafe } from "@/lib/fetch-json";
import { cartStorageKey, savedCartCount } from "@/lib/restaurant-posts/cart-peek";
import type { PostCounter } from "@/lib/restaurant-posts/types";
import type { PublicMenu } from "@/lib/site-orders/menu";
import { primary } from "../ui";

// Les gestes du lecteur (ADR 0111) : « Voir la carte », « Signaler cet article », et « Voir mon panier ». Les compteurs
// envoyés ne disent que l'article et le geste : rien sur le lecteur, et jamais une erreur à l'écran pour lui.

function count(restaurantId: string, slug: string, event: PostCounter) {
  void fetch("/api/restaurant-posts/count", {
    method: "POST", headers: { "content-type": "application/json" }, keepalive: true,
    body: JSON.stringify({ restaurantId, slug, event }),
  }).catch(() => undefined);
}

function BottomBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-paper-border bg-white p-3" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom, 0px))" }}>
      <div className="mx-auto max-w-2xl">{children}</div>
    </div>
  );
}

/** Compte la lecture (une fois par affichage) et pose le bouton « Voir la carte », compté lui aussi. */
export function ReadAndMenuBar({ restaurantId, slug }: { restaurantId: string; slug: string }) {
  const counted = useRef<string | null>(null);
  useEffect(() => {
    if (counted.current === slug) return;
    counted.current = slug;
    count(restaurantId, slug, "lecture");
  }, [restaurantId, slug]);
  return (
    <BottomBar>
      <Link href={`/commander/${restaurantId}`} onClick={() => count(restaurantId, slug, "carte")} className={`${primary} flex w-full items-center justify-center`}>
        Voir la carte
      </Link>
    </BottomBar>
  );
}

/** « Voir mon panier » : seulement quand la page de commande en a gardé un dans ce navigateur. Lu, jamais modifié. */
export function CartReturnBar({ restaurantId, menu }: { restaurantId: string; menu: PublicMenu }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    try {
      setN(savedCartCount(localStorage.getItem(cartStorageKey(restaurantId)), menu));
    } catch {
      /* stockage refusé (navigation privée) : pas de barre */
    }
  }, [restaurantId, menu]);
  if (n === 0) return null;
  return (
    <BottomBar>
      <Link href={`/commander/${restaurantId}`} className={`${primary} flex w-full items-center justify-center`}>
        Voir mon panier ({n} {n > 1 ? "plats" : "plat"})
      </Link>
    </BottomBar>
  );
}

export function ReportButton({ restaurantId, slug }: { restaurantId: string; slug: string }) {
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  async function report() {
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/restaurant-posts/report", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ restaurantId, slug }) });
      if (res.ok) { setState("done"); return; }
      const { data } = await readJsonSafe<{ error?: string }>(res);
      setError(data?.error ?? "Le signalement n'est pas parti. Réessaie.");
    } catch {
      setError("Le signalement n'est pas parti. Vérifie ta connexion et réessaie.");
    }
    setState("idle");
  }
  return (
    <div>
      {state === "done" ? (
        <p role="status" className="min-h-[44px] py-3 text-[15px] text-ink-muted">Merci, ton signalement est envoyé à Boosteats.</p>
      ) : (
        <button type="button" onClick={() => void report()} disabled={state === "sending"} className="inline-flex min-h-[44px] items-center text-[15px] font-semibold text-boost-olive-dark underline hover:text-ink disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink">
          Signaler cet article
        </button>
      )}
      {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
    </div>
  );
}
