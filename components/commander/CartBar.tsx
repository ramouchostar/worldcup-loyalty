import { euro } from "@/lib/site-orders/cart";
import { primary } from "./ui";

// La barre fixée en bas de la carte, qui ouvre le panier.

export function CartBar({ count, totalCents, onOpen }: { count: number; totalCents: number; onOpen: () => void }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-paper-border bg-white p-3" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom, 0px))" }}>
      <div className="mx-auto max-w-2xl">
        <button type="button" onClick={onOpen} className={`${primary} w-full`}>Voir ma commande ({count}) · {euro(totalCents)}</button>
      </div>
    </div>
  );
}
