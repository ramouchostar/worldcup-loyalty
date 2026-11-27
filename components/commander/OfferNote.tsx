import type { PublicOffer } from "@/lib/site-offers/offers";
import { accentLink, notice } from "./ui";

// ADR 0110 §1 — sous le total du panier : le total ne compte pas l'offre, elle se demande au comptoir.

const readLabel = (o: PublicOffer): string => (o.conditions === null ? "Voir l'offre" : "Lire les conditions");

export function OfferNote({ offers, onRead }: { offers: PublicOffer[]; onRead: (offer: PublicOffer) => void }) {
  if (offers.length === 0) return null;
  const several = offers.length > 1;
  return (
    <div className={notice}>
      {offers.map((o) => (
        <div key={o.id} className="mb-1">
          <b className="block break-words font-semibold">Offre en cours : {o.title}</b>
          {several && (
            <button type="button" onClick={() => onRead(o)} aria-label={`${readLabel(o)} : ${o.title}`} className={`${accentLink} -ml-3`}>{readLabel(o)}</button>
          )}
        </div>
      ))}
      <p>Le total ne compte pas {several ? "les offres. Dis-le" : "l'offre. Dis-le"} au comptoir.</p>
      {!several && <button type="button" onClick={() => onRead(offers[0])} className={`${accentLink} -ml-3`}>{readLabel(offers[0])}</button>}
    </div>
  );
}
