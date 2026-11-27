"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readJsonSafe } from "@/lib/fetch-json";
import type { PublicOffer } from "@/lib/site-offers/offers";

// ADR 0110 §4, §5 — les offres valables aujourd'hui, lues à l'ouverture de la page et RELUES quand le client y revient. Sans
// réponse, aucune offre n'est montrée (la carte, elle, ne dépend pas d'elles). Les compteurs ne portent rien sur le client et
// ne le dérangent jamais.

export function useOffers(restaurantId: string) {
  const [offers, setOffers] = useState<PublicOffer[]>([]);
  const live = useRef(true);
  const seen = useRef(new Set<string>());

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`/api/site-orders/offers?restaurantId=${encodeURIComponent(restaurantId)}`, { cache: "no-store" });
      const { data } = await readJsonSafe<{ offers?: PublicOffer[] }>(res);
      if (live.current) setOffers(res.ok && Array.isArray(data?.offers) ? data.offers : []);
    } catch {
      if (live.current) setOffers([]);
    }
  }, [restaurantId]);

  useEffect(() => {
    live.current = true;
    void reload();
    const onVisible = () => { if (document.visibilityState === "visible") void reload(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { live.current = false; document.removeEventListener("visibilitychange", onVisible); };
  }, [reload]);

  const count = useCallback((kind: "affichee" | "ouverte", offerIds: string[]) => {
    if (offerIds.length === 0) return;
    void fetch("/api/site-orders/offers", {
      method: "POST", headers: { "content-type": "application/json" }, keepalive: true,
      body: JSON.stringify({ restaurantId, kind, offerIds }),
    }).catch(() => undefined);
  }, [restaurantId]);

  /** Une offre montrée se compte une fois par visite de la page. */
  const shown = useCallback((ids: string[]) => {
    const fresh = ids.filter((id) => !seen.current.has(id));
    for (const id of fresh) seen.current.add(id);
    count("affichee", fresh);
  }, [count]);

  const opened = useCallback((id: string) => count("ouverte", [id]), [count]);

  return { offers, shown, opened };
}
