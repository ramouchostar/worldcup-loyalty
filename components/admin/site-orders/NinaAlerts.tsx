"use client";

import { useCallback, useEffect, useState } from "react";
import { readJsonSafe } from "@/lib/fetch-json";
import type { NinaAlert } from "@/lib/site-orders/nina-alerts";

// ADR 0108 §6 — « À régler d'abord » : ce que Nina a vu sur l'espace de commande et qui ne peut pas attendre. Une alerte n'est pas une
// idée : pas de « Oui / Non », un seul geste, « J'ai vu ». Elle revient si elle s'aggrave (la signature change), jamais si c'est la même.
// « J'ai vu » est un confort de CET appareil (localStorage) : il ne cache rien aux autres écrans du restaurant.

const btn = "min-h-[44px] rounded-lg px-4 py-2 text-[15px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink";
const REFRESH_MS = 30_000;

const key = (restaurantId: string) => `nina_alerts_seen:${restaurantId}`;

function readSeen(restaurantId: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(key(restaurantId));
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, string>) : {};
  } catch {
    return {}; // stockage refusé ou illisible : rien n'est caché, jamais une erreur
  }
}

function writeSeen(restaurantId: string, seen: Record<string, string>) {
  try { localStorage.setItem(key(restaurantId), JSON.stringify(seen)); } catch { /* sans stockage, « J'ai vu » ne dure que cette page */ }
}

export function NinaAlerts({ restaurantId }: { restaurantId: string }) {
  const [alerts, setAlerts] = useState<NinaAlert[] | null>(null);
  const [seen, setSeen] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);

  useEffect(() => { setSeen(readSeen(restaurantId)); }, [restaurantId]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/site-orders/alerts?restaurantId=${encodeURIComponent(restaurantId)}`, { cache: "no-store" });
      const { data } = await readJsonSafe<{ alerts?: NinaAlert[] }>(res);
      if (res.status === 404 || res.status === 503) { setAlerts([]); setFailed(false); return; } // fermé ou pas activé : la page des commandes le dit déjà
      if (!res.ok || !Array.isArray(data?.alerts)) { setFailed(true); return; }
      setAlerts(data.alerts);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [restaurantId]);

  useEffect(() => {
    void load();
    const t = setInterval(() => { if (document.visibilityState === "visible") void load(); }, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  function markSeen(a: NinaAlert) {
    const next = { ...seen, [a.id]: a.signature };
    setSeen(next);
    writeSeen(restaurantId, next);
  }

  // Une lecture qui échoue ne se tait pas : on le dit, sans effacer ce qu'on savait.
  if (alerts === null) return failed ? <p role="alert" className="rounded-lg border border-paper-border px-3 py-2 text-[13px] text-ink-muted">Nina n&apos;a pas pu vérifier ton espace de commande. Recharge la page dans un instant.</p> : null;

  const shown = alerts.filter((a) => seen[a.id] !== a.signature);
  if (shown.length === 0) {
    return failed ? <p role="alert" className="rounded-lg border border-paper-border px-3 py-2 text-[13px] text-ink-muted">Nina n&apos;a pas pu vérifier ton espace de commande à l&apos;instant. Les alertes affichées peuvent être en retard.</p> : null;
  }

  return (
    <section aria-label="Alertes de Nina" className="space-y-3">
      <div>
        <h2 className="text-[17px] font-semibold text-ink">À régler d&apos;abord</h2>
        <p className="text-[13px] text-ink-muted">Nina surveille ton espace de commande et te prévient de ce qui ne peut pas attendre.</p>
      </div>
      <ul className="space-y-3">
        {shown.map((a) => (
          <li key={a.id} role={a.tone === "danger" ? "alert" : "status"} className={`flex flex-wrap items-start gap-3 rounded-xl border bg-white p-4 ${a.tone === "danger" ? "border-danger" : "border-warn"}`}>
            <div className="min-w-[220px] flex-1 space-y-1">
              <p className={`text-[15px] font-semibold ${a.tone === "danger" ? "text-danger" : "text-ink"}`}>{a.title}</p>
              <p className="text-[15px] text-ink">{a.detail}</p>
            </div>
            <button type="button" onClick={() => markSeen(a)} className={`${btn} border border-paper-border bg-white text-ink hover:border-ink-faint`}>J&apos;ai vu</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
