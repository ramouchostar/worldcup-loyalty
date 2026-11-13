"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { visibleGroups } from "@/lib/menu-options/model";
import type { OptionChoice, OptionGroup, Selection } from "@/lib/menu-options/types";
import { euro, selectionState, setChoiceQty, startSelection, unitCents } from "@/lib/site-orders/cart";
import type { PublicItem } from "@/lib/site-orders/menu";
import { MAX_QTY } from "@/lib/site-orders/order";

// ADR 0099 §2 — la fiche d'un plat : ses choix (sauces, taille, suppléments, « sans »), sa quantité, son prix. Le prix
// affiché est un confort : le serveur le recalcule à l'envoi.

const btn = "min-h-[44px] rounded-lg px-4 py-2 text-[15px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink";

/** La règle d'un groupe, en une phrase adressée au client. */
export function groupHint(g: OptionGroup): string {
  if (g.kind === "retrait") return "Ce que tu ne veux pas";
  if (g.max === 1) return g.min >= 1 ? "Choisis-en un" : "Un au plus, si tu veux";
  if (g.max === null) return g.min >= 1 ? `Au moins ${g.min}` : "Autant que tu veux";
  if (g.min === g.max) return `Choisis-en ${g.max}`;
  return g.min >= 1 ? `Entre ${g.min} et ${g.max}` : `Jusqu'à ${g.max}`;
}

const label = (g: OptionGroup, c: OptionChoice) => (g.kind === "retrait" ? `Sans ${c.name.toLocaleLowerCase("fr-BE")}` : c.name);

export function DishSheet({ item, onAdd, onClose }: { item: PublicItem; onAdd: (selection: Selection, qty: number) => void; onClose: () => void }) {
  const [selection, setSelection] = useState<Selection>(() => startSelection(item.groups));
  const [qty, setQty] = useState(1);
  const ref = useRef<HTMLDivElement>(null);
  const state = useMemo(() => selectionState(item.groups, selection), [item.groups, selection]);
  const open = useMemo(() => visibleGroups(item.groups, selection), [item.groups, selection]);

  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const unit = unitCents(item, selection);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={item.name} onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-xl bg-white outline-none sm:rounded-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-paper-border p-4">
          <div className="min-w-0">
            <h2 className="break-words text-[20px] font-semibold text-ink">{item.name}</h2>
            {item.description && <p className="mt-1 text-[15px] text-ink-muted">{item.description}</p>}
            <p className="mt-1 text-[13px] text-ink-muted">{item.allergens.text}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className={`${btn} shrink-0 border border-paper-border bg-white text-ink`}>Fermer</button>
        </div>

        <div className="space-y-5 overflow-y-auto p-4">
          {open.length === 0 && <p className="text-[15px] text-ink-muted">Ce plat se commande tel quel.</p>}
          {open.map(({ path, group, depth }) => {
            const picked = selection[path] ?? {};
            const radio = group.max === 1 && group.min >= 1;
            return (
              <fieldset key={path} className="min-w-0" style={{ marginLeft: depth * 12 }}>
                <legend className="text-[17px] font-semibold text-ink">{group.title}</legend>
                <p className="mb-2 text-[13px] text-ink-muted">{groupHint(group)}</p>
                <ul className="space-y-1.5">
                  {group.choices.filter((c) => c.isAvailable).map((c) => {
                    const q = picked[c.id] ?? 0;
                    const id = `${path}-${c.id}`;
                    return (
                      <li key={c.id} className="flex min-w-0 items-center gap-3 rounded-lg border border-paper-border px-3 py-2">
                        <input
                          id={id} type={radio ? "radio" : "checkbox"} name={path} className="h-5 w-5 shrink-0 accent-boost-olive" checked={q > 0}
                          onChange={(e) => setSelection((s) => setChoiceQty(item.groups, s, path, c.id, e.target.checked ? 1 : 0))}
                        />
                        <label htmlFor={id} className="min-w-0 flex-1 break-words text-[15px] text-ink">{label(group, c)}</label>
                        {c.priceDelta > 0 && <span className="shrink-0 text-[13px] tabular-nums text-ink-muted">+ {euro(Math.round(c.priceDelta * 100))}</span>}
                        {c.maxQty > 1 && q > 0 && (
                          <span className="flex shrink-0 items-center gap-1">
                            <button type="button" aria-label={`Un ${c.name} de moins`} className="h-9 w-9 rounded-lg border border-paper-border text-[17px]" onClick={() => setSelection((s) => setChoiceQty(item.groups, s, path, c.id, q - 1))}>−</button>
                            <span className="w-6 text-center text-[15px] tabular-nums" aria-live="polite">{q}</span>
                            <button type="button" aria-label={`Un ${c.name} de plus`} className="h-9 w-9 rounded-lg border border-paper-border text-[17px]" onClick={() => setSelection((s) => setChoiceQty(item.groups, s, path, c.id, q + 1))}>+</button>
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            );
          })}
        </div>

        <div className="space-y-2 border-t border-paper-border p-4">
          {!state.ok && state.missing.length > 0 && <p role="status" className="text-[13px] text-ink-muted">À choisir : {state.missing.join(", ")}.</p>}
          {!state.ok && state.missing.length === 0 && state.message && <p role="alert" className="text-[13px] text-danger">{state.message}</p>}
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <button type="button" aria-label="Un de moins" className="h-11 w-11 rounded-lg border border-paper-border text-[20px]" onClick={() => setQty((n) => Math.max(1, n - 1))}>−</button>
              <span className="w-8 text-center text-[17px] font-semibold tabular-nums" aria-live="polite">{qty}</span>
              <button type="button" aria-label="Un de plus" className="h-11 w-11 rounded-lg border border-paper-border text-[20px]" onClick={() => setQty((n) => Math.min(MAX_QTY, n + 1))}>+</button>
            </span>
            <button
              type="button" disabled={!state.ok} onClick={() => onAdd(selection, qty)}
              className={`${btn} min-w-0 flex-1 bg-boost-olive text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50`}
            >
              Ajouter · {euro(unit * qty)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
