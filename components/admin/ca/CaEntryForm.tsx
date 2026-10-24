"use client";

import { useMemo, useState } from "react";
import { saveCaDay } from "@/app/admin/[restaurantId]/ca/actions";
import { CHANNELS, type ChannelKey, type Channels } from "@/lib/daily-revenue-entry";

// ADR 0087 §2 — deux façons de saisir, montrées à égalité : par canal (le
// total se calcule) ou le total directement. Taper dans l'une vide l'autre :
// un seul chiffre fait foi. Le serveur relit tout (parseEntry) ; ce calcul
// n'est qu'un affichage.

type Mode = "canal" | "total";

function toNumber(raw: string): number {
  const compact = raw.replace(/[\s €]/g, "");
  const thousands = /^\d{1,3}(\.\d{3})+$/.test(compact) ? compact.replace(/\./g, "") : compact;
  const n = Number(thousands.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const euros = (n: number) => `${n.toLocaleString("fr-BE", { maximumFractionDigits: 2 })} €`;
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
  initial: { amount: number | null; tickets: number | null; channels: Channels | null };
}) {
  const [mode, setMode] = useState<Mode>(initial.amount !== null && !initial.channels ? "total" : "canal");
  const [channels, setChannels] = useState<Record<ChannelKey, string>>(() => {
    const out = {} as Record<ChannelKey, string>;
    for (const c of CHANNELS) out[c.key] = fmt(initial.channels?.[c.key]);
    return out;
  });
  const [total, setTotal] = useState(initial.amount !== null && !initial.channels ? fmt(initial.amount) : "");
  const [orders, setOrders] = useState(fmt(initial.tickets));

  const channelsSum = useMemo(() => CHANNELS.reduce((s, c) => s + toNumber(channels[c.key]), 0), [channels]);

  function typeChannel(key: ChannelKey, value: string) {
    setChannels((c) => ({ ...c, [key]: value }));
    setTotal("");
    setMode("canal");
  }
  function typeTotal(value: string) {
    setTotal(value);
    setChannels((c) => Object.fromEntries(Object.keys(c).map((k) => [k, ""])) as Record<ChannelKey, string>);
    setMode("total");
  }

  const block = (on: boolean) =>
    `bg-white rounded-xl border p-4 sm:p-5 transition-colors ${on ? "border-ink ring-2 ring-ink/10" : "border-paper-border"}`;
  const input =
    "w-full min-h-[44px] rounded-lg border border-paper-border bg-paper px-3 text-right tabular-nums text-[15px] text-ink focus:outline-none focus:ring-2 focus:ring-ink/30";

  return (
    <form action={saveCaDay} className="space-y-4" autoComplete="off">
      <input type="hidden" name="r" value={restaurantId} />
      <input type="hidden" name="jour" value={day} />

      <section className={block(mode === "canal")} aria-labelledby="ca-canal">
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h2 id="ca-canal" className="font-display text-[16px] font-bold text-ink">Par canal</h2>
          <span className="text-[12px] text-ink-muted">remplis ce que tu as</span>
        </div>
        <div className="space-y-2.5">
          {CHANNELS.map((c) => (
            <div key={c.key} className="grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-3">
              <label htmlFor={`canal_${c.key}`} className="text-[14px] text-ink">{c.label}</label>
              <input
                id={`canal_${c.key}`}
                name={`canal_${c.key}`}
                inputMode="decimal"
                placeholder="—"
                value={channels[c.key]}
                onChange={(e) => typeChannel(c.key, e.target.value)}
                className={input}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between border-t border-dashed border-paper-border mt-3 pt-3 text-[14.5px] font-semibold text-ink tabular-nums">
          <span>Total</span>
          <span>{euros(channelsSum)}</span>
        </div>
      </section>

      <p className="text-center text-[12px] uppercase tracking-[0.12em] text-ink-muted">ou</p>

      <section className={block(mode === "total")} aria-labelledby="ca-total">
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <h2 id="ca-total" className="font-display text-[16px] font-bold text-ink">Le total directement</h2>
          <span className="text-[12px] text-ink-muted">un seul chiffre</span>
        </div>
        <label htmlFor="total" className="text-[13px] text-ink-muted">Total de la journée, TVA comprise</label>
        <input
          id="total"
          name="total"
          inputMode="decimal"
          placeholder="0 €"
          value={total}
          onChange={(e) => typeTotal(e.target.value)}
          className={`${input} mt-1.5 min-h-[52px] text-[22px] font-bold font-display`}
        />
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-3 px-1">
        <label htmlFor="commandes" className="text-[14px] text-ink">
          Nombre de commandes <span className="text-ink-muted">(facultatif)</span>
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
