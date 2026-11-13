"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, StatusBadge } from "@/components/admin/ui";
import { TicketView } from "@/components/admin/menu-options/KitchenTickets";
import { readJsonSafe } from "@/lib/fetch-json";
import { plural } from "@/lib/menu-options/copy";
import { buildTickets, distinctZones } from "@/lib/menu-options/tickets";
import { STATUS_LABEL, isOpen, minutesToReady, toTicketLines, type OrderStatus } from "@/lib/site-orders/order";
import type { OrderView } from "@/lib/site-orders/service";

// ADR 0099 §2 — « Commandes du site » : ce que les clients ont commandé sur le site, retrait et paiement au comptoir.
// Pas d'imprimante pour l'instant : le restaurateur lit l'écran. La liste se rafraîchit seule toutes les 15 secondes.

type Phase = "loading" | "closed" | "unavailable" | "error" | "ready";

const btn = "min-h-[44px] rounded-lg px-4 py-2 text-[15px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink";
const ghost = `${btn} border border-paper-border bg-white text-ink hover:border-ink-faint`;
const primary = `${btn} bg-ink text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50`;
const euro = (cents: number) => (cents / 100).toLocaleString("fr-BE", { style: "currency", currency: "EUR" });

function ago(iso: string, now: number): string {
  const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  return `il y a ${Math.floor(min / 60)} h ${String(min % 60).padStart(2, "0")}`;
}

function OrderCard({ o, now, busy, onChange }: { o: OrderView; now: number; busy: boolean; onChange: (id: string, status: OrderStatus, reason?: string) => void }) {
  const [tickets, setTickets] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const lines = toTicketLines(o.lines);
  const zones = distinctZones(lines.map((l) => l.zone));
  const shown = tickets
    ? buildTickets({ number: o.number, firstName: o.firstName, pickup: "", lines }, { split: zones.length > 1, cashier: zones.length > 1 })
    : [];
  const prep = minutesToReady(o.createdAt, o.readyAt);

  return (
    <li className="min-w-0 space-y-3 rounded-xl border border-paper-border bg-white p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="break-words text-[32px] font-semibold leading-tight text-ink">{o.firstName}</span>
        <span className="text-[15px] text-ink-muted">N° {o.number}</span>
        <StatusBadge tone={o.status === "annulee" ? "danger" : o.status === "prete" ? "good" : o.status === "retiree" ? "neutral" : "warn"}>{STATUS_LABEL[o.status]}</StatusBadge>
        <span className="text-[13px] text-ink-muted">{ago(o.createdAt, now)}</span>
        {prep !== null && <span className="text-[13px] text-ink-muted">prête en {prep} min</span>}
      </div>

      {o.phone && (
        <p className="text-[15px] text-ink">
          Téléphone : <a href={`tel:${o.phone}`} className="font-semibold underline">{o.phone}</a>
        </p>
      )}

      <ul className="space-y-2 border-t border-dashed border-paper-border pt-3">
        {o.lines.map((l, i) => {
          const without = l.details.filter((d) => d.kind === "sans");
          const rest = l.details.filter((d) => d.kind !== "sans");
          return (
            <li key={i}>
              <div className="flex justify-between gap-3 text-[15px] font-semibold text-ink"><span className="min-w-0 break-words">{l.qty}× {l.name}</span><span className="shrink-0 tabular-nums">{euro(l.cents)}</span></div>
              {rest.length > 0 && <div className="pl-4 text-[13px] text-ink-muted">{rest.map((d) => (d.kind === "extra" ? `+ ${d.name}${d.qty > 1 ? ` ×${d.qty}` : ""}` : d.name)).join(", ")}</div>}
              {without.map((d) => <div key={d.name} className="pl-4 text-[15px] font-semibold text-ink">SANS {d.name.toLocaleUpperCase("fr-BE")}</div>)}
            </li>
          );
        })}
      </ul>

      <div className="flex justify-between border-t border-dashed border-paper-border pt-2 text-[17px] font-semibold text-ink"><span>À PAYER AU COMPTOIR</span><span className="tabular-nums">{euro(o.totalCents)}</span></div>
      {o.status === "annulee" && o.cancelReason && <p className="text-[13px] text-ink-muted">Raison : {o.cancelReason}</p>}

      <div className="flex flex-wrap gap-2">
        {o.status === "recue" && <button type="button" className={primary} disabled={busy} onClick={() => onChange(o.id, "prete")}>Prête</button>}
        {o.status === "prete" && <button type="button" className={primary} disabled={busy} onClick={() => onChange(o.id, "retiree")}>Retirée par le client</button>}
        {isOpen(o.status) && !cancelling && <button type="button" className={ghost} disabled={busy} onClick={() => setCancelling(true)}>Annuler</button>}
        <button type="button" className={ghost} aria-expanded={tickets} onClick={() => setTickets((t) => !t)}>{tickets ? "Cacher les tickets" : "Voir les tickets de cuisine"}</button>
      </div>

      {cancelling && (
        <div className="space-y-2 rounded-lg border border-paper-border p-3">
          <label className="block text-[15px] font-semibold text-ink" htmlFor={`reason-${o.id}`}>Pourquoi ? Le client n&apos;est pas prévenu, appelle-le.</label>
          <input id={`reason-${o.id}`} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Plus de poulet, client injoignable…"
            className="block min-h-[44px] w-full min-w-0 rounded-lg border border-paper-border bg-white px-2.5 py-1.5 text-[15px] text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink" />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={primary} disabled={busy} onClick={() => onChange(o.id, "annulee", reason)}>Confirmer l&apos;annulation</button>
            <button type="button" className={ghost} onClick={() => { setCancelling(false); setReason(""); }}>Garder la commande</button>
          </div>
        </div>
      )}

      {tickets && <div className="grid gap-3 sm:grid-cols-2">{shown.map((t) => <TicketView key={t.title} t={t} />)}</div>}
    </li>
  );
}

export function SiteOrdersBoard({ restaurantId }: { restaurantId: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [orders, setOrders] = useState<OrderView[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const live = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/site-orders?restaurantId=${encodeURIComponent(restaurantId)}`, { cache: "no-store" });
      const { data } = await readJsonSafe<{ orders?: OrderView[]; error?: string }>(res);
      if (!live.current) return;
      if (res.status === 404) { setPhase("closed"); return; }
      if (res.status === 503) { setPhase("unavailable"); return; }
      if (!res.ok || !data?.orders) { setPhase((p) => (p === "ready" ? p : "error")); return; }
      setOrders(data.orders);
      setNow(Date.now());
      setPhase("ready");
    } catch {
      if (live.current) setPhase((p) => (p === "ready" ? p : "error"));
    }
  }, [restaurantId]);

  useEffect(() => {
    live.current = true;
    void load();
    const t = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 15000);
    return () => { live.current = false; clearInterval(t); };
  }, [load]);

  async function change(id: string, status: OrderStatus, reason?: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/site-orders", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ restaurantId, id, status, reason }) });
      const { data } = await readJsonSafe<{ error?: string }>(res);
      if (!res.ok) setError(data?.error ?? "Le changement n'a pas pu être enregistré. Réessaie.");
      await load();
    } catch {
      setError("Le changement n'a pas pu partir. Vérifie ta connexion et réessaie.");
    } finally {
      setBusy(false);
    }
  }

  if (phase === "loading") return <div className="space-y-3">{[1, 2].map((i) => <div key={i} className="h-32 animate-pulse rounded-xl border border-paper-border bg-white" />)}</div>;
  if (phase === "closed") return <Card><p className="text-[15px] text-ink">Les commandes de ton site (Nina, en pilote) ne sont pas encore ouvertes pour ton établissement. Nous te prévenons dès que c&apos;est le cas.</p></Card>;
  if (phase === "unavailable") return <Card><p className="text-[15px] text-ink">Les commandes du site ne sont pas encore activées pour ton compte. Réessaie dans un moment : nous nous en occupons.</p></Card>;
  if (phase === "error") return <Card><p role="alert" className="text-[15px] text-danger">Impossible de lire les commandes pour le moment. Recharge la page, ou réessaie dans un instant.</p></Card>;

  const toPrepare = orders.filter((o) => o.status === "recue");
  const ready = orders.filter((o) => o.status === "prete");
  const done = orders.filter((o) => !isOpen(o.status));

  return (
    <div className="space-y-5">
      <p className="text-[15px] text-ink-muted">Retrait au comptoir, paiement au comptoir. Cette page se met à jour toute seule : garde-la ouverte pendant le service. Aucune imprimante n&apos;est branchée pour l&apos;instant, il n&apos;y a pas de son.</p>
      {error && <div role="alert" className="rounded-lg border border-danger px-3 py-2 text-[15px] text-danger">{error}</div>}

      <section className="space-y-3" aria-label="À préparer">
        <h2 className="text-[17px] font-semibold text-ink">À préparer ({toPrepare.length})</h2>
        {toPrepare.length === 0 ? <p className="text-[15px] text-ink-muted">Aucune commande à préparer.</p> : <ul className="space-y-3">{toPrepare.map((o) => <OrderCard key={o.id} o={o} now={now} busy={busy} onChange={change} />)}</ul>}
      </section>

      <section className="space-y-3" aria-label="Prêtes">
        <h2 className="text-[17px] font-semibold text-ink">Prêtes, à retirer ({ready.length})</h2>
        {ready.length === 0 ? <p className="text-[15px] text-ink-muted">Aucune commande n&apos;attend le client.</p> : <ul className="space-y-3">{ready.map((o) => <OrderCard key={o.id} o={o} now={now} busy={busy} onChange={change} />)}</ul>}
      </section>

      {done.length > 0 && (
        <details className="space-y-3">
          <summary className="cursor-pointer text-[17px] font-semibold text-ink">Terminées depuis 24 h ({done.length})</summary>
          <ul className="mt-3 space-y-3">{done.map((o) => <OrderCard key={o.id} o={o} now={now} busy={busy} onChange={change} />)}</ul>
        </details>
      )}
      <p className="text-[13px] text-ink-muted">{plural(orders.length, "commande", "commandes")} sur les dernières 24 heures.</p>
    </div>
  );
}
