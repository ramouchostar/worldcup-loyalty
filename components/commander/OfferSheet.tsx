"use client";

import { useEffect, useRef } from "react";
import type { PublicItem } from "@/lib/site-orders/menu";
import type { PublicOffer } from "@/lib/site-offers/offers";
import { ghost, offerTag, primary } from "./ui";

// ADR 0110 §1, §4 — la fiche d'une offre : titre, conditions, validité, comment en profiter, « Voir le plat ». La page le dit :
// la remise se fait au comptoir, le total affiché ne la compte pas. Plein écran sur téléphone, fenêtre sur ordinateur.

type Props = {
  restaurantName: string;
  offer: PublicOffer;
  /** Le plat concerné, s'il est sur la carte : sa photo sert d'image. */
  item: PublicItem | null;
  onSeeDish: () => void;
  onClose: () => void;
};

const Row = ({ term, children }: { term: string; children: string }) => (
  <div className="border-t border-paper-border py-3">
    <dt className="text-[15px] font-semibold text-ink">{term}</dt>
    <dd className="mt-0.5 break-words text-[15px] text-ink-muted">{children}</dd>
  </div>
);

export function OfferSheet({ restaurantName, offer, item, onSeeDish, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-white sm:items-center sm:bg-[rgba(28,28,26,0.5)] sm:p-6" onClick={onClose}>
      <div
        ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Offre : ${offer.title}`} onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-lg flex-col bg-white outline-none sm:h-auto sm:max-h-full sm:rounded-lg sm:shadow-[0_8px_24px_rgba(12,21,9,0.10)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-paper-border p-4">
          <div className="min-w-0">
            <p className={offerTag}>Offre de {restaurantName}</p>
            <h2 className="break-words text-[20px] font-semibold leading-tight text-ink">{offer.title}</h2>
          </div>
          <button type="button" onClick={onClose} className={`${ghost} !min-h-[44px] shrink-0`}>Fermer</button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {item?.imageUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={item.imageUrl} alt={item.name} className="h-[200px] w-full rounded-lg bg-paper-subtle object-cover" />}
          <dl>
            <Row term="Quand">{offer.long}</Row>
            {offer.conditions !== null && <Row term="Conditions">{offer.conditions}</Row>}
            <Row term="Comment en profiter">Envoie ta commande, puis dis au comptoir que tu as vu cette offre.</Row>
          </dl>
          <p className="rounded-lg border border-paper-border bg-paper-subtle px-3.5 py-3 text-[15px] text-ink">
            <b className="font-semibold">La remise se fait au comptoir.</b> Le total affiché sur le site ne la compte pas.
          </p>
        </div>
        <div className="flex flex-col gap-2 border-t border-paper-border p-4" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom, 0px))" }}>
          {item && <button type="button" onClick={onSeeDish} className={`${primary} w-full`}>Voir le plat</button>}
          <button type="button" onClick={onClose} className={`${ghost} w-full`}>Retour à la carte</button>
        </div>
      </div>
    </div>
  );
}
