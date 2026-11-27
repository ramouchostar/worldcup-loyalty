"use client";

import { useEffect } from "react";
import type { PublicOffer } from "@/lib/site-offers/offers";
import { offerCard, offerTag } from "./ui";

// ADR 0110 §4 — les offres du jour, entre l'en-tête et la carte : trois au plus, celle qui finit le plus tôt d'abord. Aucune
// offre : rien n'est rendu, pas même un conteneur. Un appui ouvre la fiche ; aucun prix ne change.

const Chevron = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className="shrink-0 text-[color:var(--co-accent-text,#4F5C2D)]">
    <path d="m9 5 7 7-7 7" />
  </svg>
);

export function PromotionsSlot({ offers, onShown, onOpen }: { offers: PublicOffer[]; onShown: (ids: string[]) => void; onOpen: (offer: PublicOffer) => void }) {
  const ids = offers.map((o) => o.id).join(",");
  useEffect(() => {
    if (ids) onShown(ids.split(","));
  }, [ids, onShown]);

  if (offers.length === 0) return null;
  const several = offers.length > 1;
  return (
    <section aria-label={several ? "Offres du moment" : "Offre du moment"} className="flex flex-col gap-2 px-4 pb-3 pt-1 lg:px-0 lg:pb-0 lg:pt-4">
      {several && <h2 className="text-[17px] font-semibold text-ink">Les offres du moment</h2>}
      {offers.map((o) => (
        <button key={o.id} type="button" onClick={() => onOpen(o)} className={`${offerCard} flex min-h-[72px] w-full items-center gap-3 text-left`}>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            {!several && <span className={offerTag}>Offre</span>}
            <span className="break-words text-[17px] font-semibold leading-snug text-ink">{o.title}</span>
            <span className="text-[13px] text-ink-body">{o.short}</span>
          </span>
          <Chevron />
        </button>
      ))}
    </section>
  );
}
