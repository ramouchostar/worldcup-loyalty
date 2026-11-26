import type { ReactNode } from "react";
import { cartTotal, euro, type Cart } from "@/lib/site-orders/cart";
import { ghost } from "./ui";

// Le panier : les lignes, leurs quantités et le total. Ce qui suit le total (coordonnées, envoi, connexion, secours) est
// passé en `children` par `OrderApp`.

type Props = {
  cart: Cart;
  restoredNote: string | null;
  onSetQty: (key: string, qty: number) => void;
  onRemove: (key: string) => void;
  onClose: () => void;
  children: ReactNode;
};

export function CartPanel({ cart, restoredNote, onSetQty, onRemove, onClose, children }: Props) {
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-white" role="dialog" aria-modal="true" aria-label="Ma commande">
      <div className="mx-auto max-w-2xl space-y-5 p-4 pb-10">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[24px] font-semibold text-ink">Ma commande</h2>
          <button type="button" className={ghost} onClick={onClose}>Retour à la carte</button>
        </div>

        <ul className="divide-y divide-paper-border">
          {cart.map((l) => (
            <li key={l.key} className="space-y-1 py-3">
              <div className="flex items-start justify-between gap-3">
                <b className="min-w-0 break-words text-[15px] text-ink">{l.name}</b>
                <span className="shrink-0 text-[15px] tabular-nums text-ink">{euro(l.unitCents * l.qty)}</span>
              </div>
              {l.details.length > 0 && (
                <p className="break-words text-[13px] text-ink-muted">
                  {l.details.map((d) => (d.kind === "sans" ? `sans ${d.name.toLocaleLowerCase("fr-BE")}` : d.kind === "extra" ? `+ ${d.name}${d.qty > 1 ? ` ×${d.qty}` : ""}` : d.name)).join(", ")}
                </p>
              )}
              <div className="flex items-center gap-2 pt-1">
                <button type="button" aria-label={`Un ${l.name} de moins`} className="h-11 w-11 rounded-lg border border-paper-border text-[20px]" onClick={() => onSetQty(l.key, l.qty - 1)}>−</button>
                <span className="w-8 text-center text-[17px] font-semibold tabular-nums" aria-live="polite">{l.qty}</span>
                <button type="button" aria-label={`Un ${l.name} de plus`} className="h-11 w-11 rounded-lg border border-paper-border text-[20px]" onClick={() => onSetQty(l.key, l.qty + 1)}>+</button>
                <button type="button" className={`${ghost} ml-auto`} onClick={() => onRemove(l.key)}>Retirer</button>
              </div>
            </li>
          ))}
        </ul>
        {cart.length === 0 && <p className="text-[15px] text-ink-muted">Ta commande est vide.</p>}
        {restoredNote && <p role="status" className="rounded-lg border border-paper-border px-3 py-2 text-[15px] text-ink">{restoredNote}</p>}

        <div className="flex justify-between border-t border-dashed border-paper-border pt-3 text-[17px] font-semibold text-ink"><span>À payer au comptoir</span><span className="tabular-nums">{euro(cartTotal(cart))}</span></div>

        {children}
      </div>
    </div>
  );
}
