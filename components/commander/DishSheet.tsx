"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MAX_DEPTH } from "@/lib/menu-options/model";
import type { OptionChoice, OptionGroup, Selection } from "@/lib/menu-options/types";
import { euro, selectionState, setChoiceQty, startSelection, unitCents } from "@/lib/site-orders/cart";
import type { PublicItem } from "@/lib/site-orders/menu";
import { MAX_QTY } from "@/lib/site-orders/order";
import { sheetColumns } from "@/lib/site-orders/sheet";
import { ghost, primary, stepper } from "./ui";
import { useWide } from "./useWide";

// ADR 0099 §2 — la fiche d'un plat : ses choix (sauces, taille, suppléments, « sans »), sa quantité, son prix. Le prix
// affiché est un confort : le serveur le recalcule à l'envoi. Sur ordinateur, une fenêtre sur deux colonnes (ADR 0108,
// maquette) ; sur téléphone, un panneau qui monte du bas.

/** La règle d'un groupe, en une phrase adressée au client. */
export function groupHint(g: OptionGroup): string {
  if (g.kind === "retrait") return "Ce que tu ne veux pas";
  if (g.max === 1) return g.min >= 1 ? "Choisis-en un" : "Un au plus, si tu veux";
  if (g.max === null) return g.min >= 1 ? `Au moins ${g.min}` : "Autant que tu veux";
  if (g.min === g.max) return `Choisis-en ${g.max}`;
  return g.min >= 1 ? `Entre ${g.min} et ${g.max}` : `Jusqu'à ${g.max}`;
}

const label = (g: OptionGroup, c: OptionChoice) => (g.kind === "retrait" ? `Sans ${c.name.toLocaleLowerCase("fr-BE")}` : c.name);

type GroupProps = {
  group: OptionGroup;
  path: string;
  depth: number;
  selection: Selection;
  onSet: (path: string, choiceId: string, qty: number) => void;
};

/** Un groupe et, sous le choix qui les ouvre, ses sous-groupes. */
function Group({ group, path, depth, selection, onSet }: GroupProps) {
  const picked = selection[path] ?? {};
  const radio = group.max === 1 && group.min >= 1;
  return (
    <fieldset className="min-w-0">
      <legend className={`font-semibold text-ink ${depth === 0 ? "text-[17px]" : "text-[15px]"}`}>{group.title}</legend>
      <p className="mb-1.5 mt-0.5 text-[13px] text-ink-muted">{groupHint(group)}</p>
      <ul>
        {group.choices.filter((c) => c.isAvailable).map((c) => {
          const q = picked[c.id] ?? 0;
          const id = `${path}-${c.id}`;
          const counted = c.maxQty > 1;
          const price = c.priceDelta > 0 && <span className="shrink-0 text-[13px] tabular-nums text-ink-muted">+ {euro(Math.round(c.priceDelta * 100))}</span>;
          return (
            <li key={c.id}>
              <div className={`flex min-w-0 items-center gap-3 border-b border-paper-border ${counted ? "min-h-[56px]" : "min-h-[48px]"}`}>
                {counted ? (
                  <>
                    <span className="min-w-0 flex-1 break-words text-[15px] text-ink">{label(group, c)}</span>
                    {price}
                    <span className="flex shrink-0 items-center gap-0.5" role="group" aria-label={`Quantité de ${c.name}`}>
                      <button type="button" aria-label={`Un ${c.name} de moins`} disabled={q === 0} className={stepper} onClick={() => onSet(path, c.id, q - 1)}>−</button>
                      <span className={`min-w-[24px] text-center text-[15px] tabular-nums ${q > 0 ? "font-semibold" : ""}`} aria-live="polite">{q}</span>
                      <button type="button" aria-label={`Un ${c.name} de plus`} disabled={q >= c.maxQty} className={stepper} onClick={() => onSet(path, c.id, q + 1)}>+</button>
                    </span>
                  </>
                ) : (
                  <>
                    <input
                      id={id} type={radio ? "radio" : "checkbox"} name={path} checked={q > 0}
                      className="h-[22px] w-[22px] shrink-0 accent-[var(--co-accent-text,#4F5C2D)]"
                      onChange={(e) => onSet(path, c.id, e.target.checked ? 1 : 0)}
                    />
                    <label htmlFor={id} className="flex min-w-0 flex-1 items-center self-stretch break-words py-2 text-[15px] text-ink">{label(group, c)}</label>
                    {price}
                  </>
                )}
              </div>
              {q > 0 && depth < MAX_DEPTH && c.groups.length > 0 && (
                <div className="my-2 ml-6 space-y-4 rounded-lg bg-paper-subtle p-3 sm:ml-[34px]">
                  {c.groups.map((g) => (
                    <Group key={g.id} group={g} path={`${path}>${c.id}>${g.id}`} depth={depth + 1} selection={selection} onSet={onSet} />
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

type Props = {
  item: PublicItem;
  /** Les choix et la quantité d'une ligne du panier qu'on modifie ; absent pour un nouveau plat. */
  initial?: { selection: Selection; qty: number };
  onAdd: (selection: Selection, qty: number) => void;
  onClose: () => void;
};

export function DishSheet({ item, initial, onAdd, onClose }: Props) {
  const [selection, setSelection] = useState<Selection>(() => initial?.selection ?? startSelection(item.groups));
  const [qty, setQty] = useState(initial?.qty ?? 1);
  const ref = useRef<HTMLDivElement>(null);
  const wide = useWide();
  const state = useMemo(() => selectionState(item.groups, selection), [item.groups, selection]);

  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const unit = unitCents(item, selection);
  const columns = wide && item.groups.length > 1 ? sheetColumns(item.groups) : [item.groups];
  const render = (g: OptionGroup) => (
    <Group key={g.id} group={g} path={g.id} depth={0} selection={selection} onSet={(path, choiceId, n) => setSelection((s) => setChoiceQty(item.groups, s, path, choiceId, n))} />
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(28,28,26,0.5)] sm:items-center" onClick={onClose}>
      <div
        ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={item.name} onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-lg bg-white shadow-[0_8px_24px_rgba(12,21,9,0.10)] outline-none sm:rounded-lg lg:max-h-[min(860px,calc(100dvh-64px))] lg:w-[800px] lg:max-w-[calc(100vw-48px)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-paper-border p-4 lg:px-7 lg:pb-5 lg:pt-6">
          <div className="min-w-0">
            <h2 className="break-words text-[20px] font-semibold leading-tight text-ink lg:text-[24px]">{item.name}</h2>
            {item.description && <p className="mt-1 text-[15px] leading-snug text-ink-muted">{item.description}</p>}
            <p className="mt-1 text-[13px] leading-snug text-ink-muted">{item.allergens.text}</p>
          </div>
          <button type="button" onClick={onClose} className={`${ghost} !min-h-[44px] shrink-0`}>Fermer</button>
        </div>

        <div className="min-h-0 overflow-y-auto p-4 lg:px-7 lg:py-6">
          {item.groups.length === 0 && <p className="text-[15px] text-ink-muted">Ce plat se commande tel quel.</p>}
          <div className={columns.length > 1 ? "grid grid-cols-2 items-start gap-x-10" : ""}>
            {columns.map((groups, i) => <div key={i} className="min-w-0 space-y-6">{groups.map(render)}</div>)}
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-paper-border p-4 lg:flex-row lg:items-center lg:gap-4 lg:px-7 lg:pb-5">
          <div className="min-w-0 empty:hidden lg:flex-1 lg:empty:block">
            {!state.ok && state.missing.length > 0 && <p role="status" className="text-[13px] text-ink-muted lg:text-[15px]">À choisir : {state.missing.join(", ")}.</p>}
            {!state.ok && state.missing.length === 0 && state.message && <p role="alert" className="text-[13px] text-danger lg:text-[15px]">{state.message}</p>}
          </div>
          <div className="flex items-center gap-3 lg:gap-4">
            <span className="flex items-center gap-0.5" role="group" aria-label="Quantité du plat">
              <button type="button" aria-label="Un de moins" disabled={qty <= 1} className={`${stepper} !h-12`} onClick={() => setQty((n) => Math.max(1, n - 1))}>−</button>
              <span className="min-w-[32px] text-center text-[17px] font-semibold tabular-nums" aria-live="polite">{qty}</span>
              <button type="button" aria-label="Un de plus" disabled={qty >= MAX_QTY} className={`${stepper} !h-12`} onClick={() => setQty((n) => Math.min(MAX_QTY, n + 1))}>+</button>
            </span>
            <button type="button" disabled={!state.ok} onClick={() => onAdd(selection, qty)} className={`${primary} min-w-0 flex-1 lg:min-w-[220px] lg:flex-none`}>
              {initial ? "Mettre à jour" : "Ajouter"} pour {euro(unit * qty)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
