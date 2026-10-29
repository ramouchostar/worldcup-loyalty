"use client";

import { useMemo, useState } from "react";
import { saveCaDay } from "@/app/admin/[restaurantId]/ca/actions";
import { CAISSE, CHANNELS, PLATEFORMES, type ChannelKey, type Channels, type LegacySplit } from "@/lib/daily-revenue-entry";

// ADR 0087 §2, amendé le 2026-10-29 — deux blocs : la caisse (carte, cash,
// commandes internet) et les plateformes (Uber Eats, Deliveroo, Takeaway),
// chacun avec son sous-total ; le total de la journée se calcule. Le serveur
// relit tout (parseEntry) ; ce calcul n'est qu'un affichage.

function toNumber(raw: string): number {
  const compact = raw.replace(/[\s €]/g, "");
  const thousands = /^\d{1,3}(\.\d{3})+$/.test(compact) ? compact.replace(/\./g, "") : compact;
  const n = Number(thousands.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const euros = (n: number) => `${n.toLocaleString("fr-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n).replace(".", ","));

export function CaEntryForm({
  restaurantId,
  day,
  dayName,
  initial,
}: {
  restaurantId: string;
  day: string;
  /** « vendredi » — pour le bouton « Valider le CA de vendredi ». */
  dayName: string;
  initial: { tickets: number | null; channels: Channels | null; legacy: LegacySplit | null };
}) {
  const [values, setValues] = useState<Record<ChannelKey, string>>(() => {
    const out = {} as Record<ChannelKey, string>;
    for (const c of CHANNELS) out[c.key] = fmt(initial.channels?.[c.key]);
    return out;
  });
  const [orders, setOrders] = useState(fmt(initial.tickets));

  const sum = (block: readonly { key: ChannelKey }[]) => block.reduce((s, c) => s + toNumber(values[c.key]), 0);
  const caisse = useMemo(() => sum(CAISSE), [values]); // eslint-disable-line react-hooks/exhaustive-deps
  const plateformes = useMemo(() => sum(PLATEFORMES), [values]); // eslint-disable-line react-hooks/exhaustive-deps

  const input =
    "w-full min-h-[44px] rounded-lg border border-paper-border bg-paper px-3 text-right tabular-nums text-[15px] text-ink focus:outline-none focus:ring-2 focus:ring-ink/30";

  const block = (id: string, title: string, rows: readonly { key: ChannelKey; label: string; hint?: string }[], subtotalLabel: string, subtotal: number) => (
    <section className="bg-white rounded-xl border border-paper-border p-4 sm:p-5" aria-labelledby={id}>
      <h2 id={id} className="font-display text-[16px] font-bold text-ink mb-3">{title}</h2>
      <div className="space-y-2.5">
        {rows.map((c) => (
          <div key={c.key} className="grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-3">
            <label htmlFor={`canal_${c.key}`} className="text-[14px] text-ink">
              {c.label}
              {c.hint && <span className="block text-[12px] text-ink-muted">{c.hint}</span>}
            </label>
            <input
              id={`canal_${c.key}`}
              name={`canal_${c.key}`}
              inputMode="decimal"
              placeholder="—"
              value={values[c.key]}
              onChange={(e) => setValues((v) => ({ ...v, [c.key]: e.target.value }))}
              className={input}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between border-t border-dashed border-paper-border mt-3 pt-3 text-[14px] text-ink-body tabular-nums">
        <span>{subtotalLabel}</span>
        <span>{euros(subtotal)}</span>
      </div>
    </section>
  );

  return (
    <form action={saveCaDay} className="space-y-4" autoComplete="off">
      <input type="hidden" name="r" value={restaurantId} />
      <input type="hidden" name="jour" value={day} />

      {initial.legacy && !initial.channels?.carte && !initial.channels?.cash && !initial.channels?.internet && (
        <p className="bg-paper-subtle border border-paper-border rounded-xl px-4 py-3 text-[13px] text-ink-body">
          Noté avant avec l&apos;ancien formulaire :{" "}
          {[initial.legacy.surPlace !== null && `sur place ${euros(initial.legacy.surPlace)}`, initial.legacy.emporter !== null && `à emporter ${euros(initial.legacy.emporter)}`].filter(Boolean).join(", ")}.
          {" "}Reporte ta caisse en carte, cash et internet.
        </p>
      )}

      {block("ca-caisse", "Caisse", CAISSE, "Sous-total caisse", caisse)}
      {block("ca-plateformes", "Plateformes", PLATEFORMES, "Sous-total plateformes", plateformes)}

      <div className="rounded-xl bg-ink text-white px-4 py-3.5 flex items-baseline justify-between gap-3">
        <span>
          <span className="block text-[12px] uppercase tracking-[0.12em] text-white/60">Total de la journée</span>
          <span className="text-[12px] text-white/60">TVA comprise</span>
        </span>
        <span className="font-display text-[24px] font-bold tabular-nums">{euros(caisse + plateformes)}</span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-3 px-1">
        <label htmlFor="commandes" className="text-[14px] text-ink">
          Nombre de commandes
          <span className="block text-[12px] text-ink-muted">facultatif — sert au panier moyen</span>
        </label>
        <input id="commandes" name="commandes" inputMode="numeric" placeholder="—" value={orders} onChange={(e) => setOrders(e.target.value)} className={input} />
      </div>

      <button type="submit" className="w-full min-h-[48px] rounded-lg bg-ink text-white text-[15px] font-semibold hover:bg-ink-body transition-colors">
        Valider le CA de {dayName}
      </button>
      <button
        type="submit"
        name="ferme"
        value="1"
        className="w-full min-h-[44px] text-[13.5px] text-ink-muted underline underline-offset-4 hover:text-ink"
      >
        Le restaurant était fermé ce jour-là
      </button>
    </form>
  );
}
