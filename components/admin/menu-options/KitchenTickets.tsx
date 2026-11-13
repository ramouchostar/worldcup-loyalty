"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/admin/ui";
import { readJsonSafe } from "@/lib/fetch-json";
import { TIPS, plural } from "@/lib/menu-options/copy";
import type { EditorState } from "@/lib/menu-options/lots";
import { MAX_ZONE, buildTickets, cleanZone, sampleSelection, suggestZone, type Ticket, type TicketLine } from "@/lib/menu-options/tickets";
import type { ArticleMeta } from "./LotCard";
import { Tip } from "./fields";

// ADR 0100 §9 — « Ce que le cuisinier reçoit » : le coin de cuisine de chaque plat, et un exemple de ticket bâti sur les
// vrais plats et les vrais choix du restaurateur. Rien n'est imprimé : il n'existe pas encore de commande du site.

type Msg = { kind: "ok" | "err"; text: string; details?: string[]; technical?: string };

const btn = "min-h-[44px] rounded-lg px-4 py-2 text-[15px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink";
const euro = (cents: number) => (cents / 100).toLocaleString("fr-BE", { style: "currency", currency: "EUR" });

function TicketView({ t }: { t: Ticket }) {
  return (
    <div className="min-w-0 rounded-lg border border-paper-border bg-white p-4 text-ink">
      <div className="text-[13px] font-semibold tracking-wide">{t.title}</div>
      <div className="mt-1 break-words text-[32px] font-semibold leading-tight">{t.firstName}</div>
      <div className="text-[13px] text-ink-muted">{t.meta}</div>
      <div className="mt-3 space-y-2 border-t border-dashed border-paper-border pt-3">
        {t.lines.map((l, i) => (
          <div key={i}>
            <div className="text-[15px] font-semibold">{l.qty}× {l.name}</div>
            {l.details.map((d) => <div key={d} className="pl-4 text-[13px]">{d}</div>)}
            {l.without.map((w) => <div key={w} className="pl-4 text-[15px] font-semibold">{w}</div>)}
          </div>
        ))}
      </div>
      {t.totalCents !== null && (
        <div className="mt-3 flex justify-between border-t border-dashed border-paper-border pt-2 text-[17px] font-semibold"><span>À PAYER</span><span className="tabular-nums">{euro(t.totalCents)}</span></div>
      )}
    </div>
  );
}

export function KitchenTickets({ restaurantId, st, meta }: { restaurantId: string; st: EditorState; meta: ArticleMeta }) {
  const ids = useMemo(() => Object.keys(st.articles), [st.articles]);
  const suggested = useMemo(() => Object.fromEntries(ids.map((id) => [id, st.families[id] ? suggestZone(st.families[id]) : null])), [ids, st.families]);

  const [available, setAvailable] = useState<boolean | null>(null); // null = on lit encore
  const [zones, setZones] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const [split, setSplit] = useState(true);
  const [cashier, setCashier] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const res = await fetch(`/api/admin/menu/options/zones?restaurantId=${encodeURIComponent(restaurantId)}`);
      const { data } = await readJsonSafe<{ zones?: Record<string, string | null> | null }>(res);
      if (!live) return;
      const saved = res.ok && data ? data.zones ?? null : null;
      setAvailable(res.ok && data ? saved !== null : false);
      // Ce qui est enregistré gagne ; sinon notre proposition d'après le genre de plat.
      setZones(Object.fromEntries(ids.map((id) => [id, saved && saved[id] ? saved[id]! : suggested[id] ?? ""])));
    })().catch(() => { if (live) { setAvailable(false); setZones(Object.fromEntries(ids.map((id) => [id, suggested[id] ?? ""]))); } });
    return () => { live = false; };
  }, [restaurantId, ids, suggested]);

  const zoneOf = (id: string) => cleanZone(zones[id]);
  const known = useMemo(() => [...new Set(ids.map((id) => cleanZone(zones[id])).filter((z): z is string => z !== null))], [ids, zones]);

  // L'exemple : un plat par coin (trois au plus), avec ses vrais choix réglés dans son groupe de plats.
  const example: TicketLine[] = useMemo(() => {
    const out: TicketLine[] = [];
    const used = new Set<string | null>();
    for (const id of ids) {
      const z = cleanZone(zones[id]);
      if (used.has(z) || out.length >= 3) continue;
      used.add(z);
      const lot = st.lots.find((l) => l.articleIds.includes(id));
      out.push({ name: st.articles[id].name, qty: 1, zone: z, cents: Math.round((meta[id]?.price ?? 0) * 100), details: lot ? sampleSelection(lot.groups) : [] });
    }
    return out;
  }, [ids, zones, st.lots, st.articles, meta]);

  const tickets = buildTickets({ number: "0147", firstName: "Amina B.", pickup: "12:40", lines: example }, { split, cashier });

  async function save() {
    setSaving(true);
    setMsg(null);
    const rows = ids.map((id) => ({ articleId: id, zone: zoneOf(id) }));
    const withSuggestion = ids.filter((id) => suggested[id] !== null);
    const trace = {
      suggested: withSuggestion.length,
      suggestedKept: withSuggestion.filter((id) => zoneOf(id) === suggested[id]).length,
      changed: withSuggestion.filter((id) => zoneOf(id) !== null && zoneOf(id) !== suggested[id]).length,
      cleared: withSuggestion.filter((id) => zoneOf(id) === null).length,
    };
    try {
      const res = await fetch("/api/admin/menu/options/zones", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ restaurantId, rows, trace }) });
      const { data } = await readJsonSafe<{ error?: string; errors?: string[]; detail?: string; rows?: number }>(res);
      if (!res.ok) { setMsg({ kind: "err", text: data?.error ?? "L'enregistrement a échoué. Réessaie.", details: data?.errors, technical: data?.detail }); return; }
      setMsg({ kind: "ok", text: `Enregistré : le coin de ${plural(data?.rows ?? rows.length, "plat", "plats")}.` });
    } catch {
      setMsg({ kind: "err", text: "L'enregistrement n'a pas pu partir. Rien n'est perdu : réessaie." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[17px] font-semibold text-ink">Ce que le cuisinier reçoit</h2>
        <Tip text={TIPS.zoneWhy} />
        <button type="button" className={`${btn} ml-auto border border-paper-border bg-white text-ink hover:border-ink-faint`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? "Fermer" : "Régler les coins de cuisine"}
        </button>
      </div>
      <p className="mt-1 text-[15px] text-ink-muted">Un ticket par coin de ta cuisine, avec le prénom du client écrit en grand. Rien n&apos;est imprimé pour l&apos;instant : voici ce que le cuisinier lira.</p>

      {open && (
        <div className="mt-4 space-y-4">
          {available === false && (
            <div role="status" className="rounded-lg border border-warn px-3 py-2 text-[15px] text-ink">
              Les coins de cuisine ne sont pas encore activés pour ton compte : tu peux voir l&apos;exemple, mais pas l&apos;enregistrer. Réessaie dans un moment.
            </div>
          )}

          <datalist id="kitchen-zones">{known.map((z) => <option key={z} value={z} />)}</datalist>
          <ul className="space-y-2">
            {ids.map((id) => (
              <li key={id} className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 basis-48 break-words text-[15px] text-ink">{st.articles[id].name}</span>
                <Tip text={TIPS.zoneField} align="right">
                  <input
                    list="kitchen-zones" maxLength={MAX_ZONE} aria-label={`Coin de cuisine de ${st.articles[id].name}`} placeholder="Cuisine"
                    value={zones[id] ?? ""} onChange={(e) => { setMsg(null); setZones((z) => ({ ...z, [id]: e.target.value })); }}
                    className="min-h-[40px] w-44 max-w-full rounded-lg border border-paper-border bg-white px-2.5 py-1.5 text-[15px] text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
                  />
                </Tip>
              </li>
            ))}
          </ul>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-[15px] text-ink" htmlFor="kt-split">
              <input id="kt-split" type="checkbox" className="h-5 w-5" checked={split} onChange={(e) => setSplit(e.target.checked)} />
              Un ticket différent pour chaque coin de la cuisine
            </label>
            {split && (
              <label className="flex items-center gap-2 text-[15px] text-ink" htmlFor="kt-cashier">
                <input id="kt-cashier" type="checkbox" className="h-5 w-5" checked={cashier} onChange={(e) => setCashier(e.target.checked)} />
                <Tip text={TIPS.zoneCashier}><span>Ajouter un ticket pour la caisse, avec le prix à payer</span></Tip>
              </label>
            )}
          </div>

          <div>
            <p className="mb-2 text-[13px] text-ink-muted">Un exemple de commande : Amina a pris {plural(example.length, "plat", "plats")} de ton menu. Le prénom est écrit en très grand pour ne pas mélanger deux tickets.</p>
            {tickets.length === 0 ? (
              <p className="text-[15px] text-ink">Ton menu est vide : il n&apos;y a pas encore de ticket à montrer.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">{tickets.map((t) => <TicketView key={t.title} t={t} />)}</div>
            )}
          </div>

          {msg && (
            <div role={msg.kind === "err" ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-[15px] ${msg.kind === "err" ? "border-danger text-danger" : "border-good text-good"}`}>
              <p>{msg.text}</p>
              {msg.details?.map((d) => <p key={d} className="mt-1 text-[13px]">{d}</p>)}
              {msg.technical && <p className="mt-1 break-words text-[13px] text-ink-muted">Détail pour l&apos;équipe : {msg.technical}</p>}
            </div>
          )}

          <button type="button" className={`${btn} bg-ink text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50`} disabled={saving || available !== true} onClick={() => void save()}>
            {saving ? "Enregistrement…" : "Enregistrer les coins"}
          </button>
        </div>
      )}
    </Card>
  );
}
