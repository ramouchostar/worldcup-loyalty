import type { ReactNode } from "react";
import { cartTotal, euro, type Cart, type CartLine } from "@/lib/site-orders/cart";
import { accentLink, removeLink, stepper } from "./ui";

// Le panier : les lignes, leurs quantités et le total. Ce qui suit le total (coordonnées, envoi, connexion, secours) est
// passé en `children` par `OrderApp`. Deux habillages d'un même contenu : en plein écran sur téléphone, toujours visible à
// droite de la carte sur ordinateur (`aside`).

type Props = {
  variant: "overlay" | "aside";
  restaurantName: string;
  cart: Cart;
  restoredNote: string | null;
  onSetQty: (key: string, qty: number) => void;
  onRemove: (key: string) => void;
  /** Absent pour un plat sans choix, ou qui n'est plus sur la carte : pas de « Modifier ». */
  canEdit: (line: CartLine) => boolean;
  onEdit: (line: CartLine) => void;
  onClose: () => void;
  /** Ce qu'on dit sous le total quand une offre est en cours (ADR 0110) : le total ne la compte pas. */
  offerNote?: ReactNode;
  children: ReactNode;
};

const details = (l: CartLine): string =>
  l.details.map((d) => (d.kind === "sans" ? `sans ${d.name.toLocaleLowerCase("fr-BE")}` : d.kind === "extra" ? `+ ${d.name}${d.qty > 1 ? ` ×${d.qty}` : ""}` : d.name)).join(", ");

export function CartPanel({ variant, restaurantName, cart, restoredNote, onSetQty, onRemove, canEdit, onEdit, onClose, offerNote, children }: Props) {
  const side = variant === "aside";
  const body = (
    <>
      {restoredNote && <p role="status" className="rounded-lg border border-paper-border bg-paper-subtle px-3 py-2 text-[15px] text-ink">{restoredNote}</p>}
      {cart.length === 0 ? (
        <p className="text-[15px] text-ink-muted">Ton panier est vide.{side ? " Choisis un plat dans la carte." : ""}</p>
      ) : (
        <ul>
          {cart.map((l) => (
            <li key={l.key} className="flex flex-col gap-2 border-t border-paper-border py-3 first:border-t-0 first:pt-0 lg:first:border-t lg:first:pt-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <b className="block break-words text-[15px] font-semibold text-ink">{l.name}</b>
                  {l.details.length > 0 && <p className="mt-0.5 break-words text-[13px] leading-snug text-ink-muted">{details(l)}</p>}
                </div>
                <span className="shrink-0 whitespace-nowrap text-[15px] font-semibold tabular-nums text-ink">{euro(l.unitCents * l.qty)}</span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-x-2">
                <div className="flex items-center gap-0.5" role="group" aria-label={`Quantité de ${l.name}`}>
                  <button type="button" aria-label={`Un ${l.name} de moins`} className={stepper} onClick={() => onSetQty(l.key, l.qty - 1)}>−</button>
                  <span className="min-w-[28px] text-center text-[17px] font-semibold tabular-nums" aria-live="polite">{l.qty}</span>
                  <button type="button" aria-label={`Un ${l.name} de plus`} className={stepper} onClick={() => onSetQty(l.key, l.qty + 1)}>+</button>
                </div>
                <div className="ml-auto flex">
                  {canEdit(l) && <button type="button" aria-label={`Modifier ${l.name}`} className={accentLink} onClick={() => onEdit(l)}>Modifier</button>}
                  <button type="button" aria-label={`Retirer ${l.name}`} className={removeLink} onClick={() => onRemove(l.key)}>Retirer</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {cart.length > 0 && (
        <div className="flex items-baseline justify-between gap-3 border-t border-paper-border pt-3 font-semibold text-ink">
          <span className="text-[17px] lg:text-[15px]">Total à payer au comptoir</span>
          <span className="whitespace-nowrap text-[20px] tabular-nums">{euro(cartTotal(cart))}</span>
        </div>
      )}
      {cart.length > 0 && offerNote}
      {children}
    </>
  );

  if (side) {
    return (
      <aside aria-label="Mon panier" className="sticky top-6 flex max-h-[calc(100dvh-3rem)] w-[360px] shrink-0 flex-col gap-4 overflow-y-auto rounded-lg border border-paper-border bg-white p-5 shadow-[0_8px_24px_rgba(12,21,9,0.10)]">
        <h2 className="text-[20px] font-semibold text-ink">Mon panier</h2>
        {body}
      </aside>
    );
  }
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-white" role="dialog" aria-modal="true" aria-label="Mon panier">
      <div className="mx-auto max-w-2xl px-4 pb-10 pt-2">
        <button type="button" className={`${accentLink} -ml-3 gap-1.5 no-underline`} onClick={onClose}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m15 5-7 7 7 7" /></svg>
          Retour à la carte
        </button>
        <div className="-mx-4 border-b border-paper-border px-4 pb-4 pt-1">
          <h2 className="text-[24px] font-semibold text-ink">Mon panier</h2>
          <p className="break-words text-[15px] text-ink-muted">{restaurantName}, à emporter</p>
        </div>
        <div className="flex flex-col gap-4 pt-4">{body}</div>
      </div>
    </div>
  );
}
