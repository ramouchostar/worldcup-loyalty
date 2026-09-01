"use client";

import { useCallback, useEffect, useState } from "react";
import type { MenuItem } from "@/types";
import { readJsonSafe, describeHttpFailure } from "@/lib/fetch-json";
import { normalizeItemName } from "@/lib/menu-match";

// ADR 0046, lot 4 — le formulaire de la boucle de complétion : une ligne par
// libellé récurrent des tickets, nom et prix de vente PRÉ-REMPLIS (médiane
// lue sur les tickets) — il ne reste typiquement que le prix de revient.
// Trois gestes par ligne ; chacun pose un alias durable et rétro-rattache
// l'historique côté serveur.

type Gap = {
  label: string;
  rawSample: string;
  normalized: string;
  orders: number;
  suggestedPrice: number | null;
};

type Draft = { name: string; price: string; cost: string; linkTo: string };

// Tri des suggestions « produit existant » : similarité naïve par tokens
// partagés — assez bon pour trier un <select>, jamais utilisé en automatique.
function similarity(a: string, b: string): number {
  const ta = new Set(normalizeItemName(a).split(" "));
  const tb = new Set(normalizeItemName(b).split(" "));
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.max(ta.size, 1);
}

export function CatalogGapsSection({
  restaurantId,
  menuItems,
  onResolved,
}: {
  restaurantId: string;
  menuItems: MenuItem[];
  onResolved?: () => void | Promise<void>;
}) {
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/catalog-gaps?restaurantId=${restaurantId}`);
    const { data } = await readJsonSafe<{ gaps?: Gap[] }>(res);
    const list = data?.gaps ?? [];
    setGaps(list);
    setDrafts((prev) => {
      const next = { ...prev };
      for (const g of list) {
        next[g.normalized] ??= {
          name: g.label,
          price: g.suggestedPrice != null ? String(g.suggestedPrice) : "",
          cost: "",
          linkTo: "",
        };
      }
      return next;
    });
  }, [restaurantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(gap: Gap, payload: Record<string, unknown>, okText: string) {
    setBusy(gap.normalized);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/catalog-gaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId, label: gap.normalized, ...payload }),
      });
      const { data } = await readJsonSafe<{ ok?: boolean; error?: string; rematched?: { matched: number } }>(res);
      if (!res.ok) {
        setMsg({ kind: "err", text: describeHttpFailure(res.status, data?.error) });
        return;
      }
      const n = data?.rematched?.matched ?? 0;
      setMsg({ kind: "ok", text: `${okText}${n > 0 ? ` — ${n} ligne${n > 1 ? "s" : ""} de tickets rattachée${n > 1 ? "s" : ""} rétroactivement.` : "."}` });
      setGaps((prev) => prev.filter((g) => g.normalized !== gap.normalized));
      await onResolved?.();
    } finally {
      setBusy(null);
    }
  }

  if (gaps.length === 0) {
    return msg ? (
      <div id="rattacher" className={`rounded-xl p-3 text-sm border ${msg.kind === "ok" ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-700"}`}>
        {msg.text}
      </div>
    ) : null;
  }

  return (
    <div id="rattacher" className="bg-white rounded-xl border border-amber-200 p-5 space-y-4">
      <div>
        <h2 className="font-bold text-gray-900">🧾 Lus sur tes tickets, absents de ton catalogue</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Ces articles reviennent sur plusieurs tickets mais ne sont rattachés à rien — tes chiffres
          de marge les ignorent. Un geste par ligne suffit ; l&apos;historique est repris automatiquement.
        </p>
      </div>

      {msg && (
        <div className={`rounded-lg p-2.5 text-sm border ${msg.kind === "ok" ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-700"}`}>
          {msg.text}
        </div>
      )}

      <div className="space-y-4">
        {gaps.map((gap) => {
          const d = drafts[gap.normalized] ?? { name: gap.label, price: "", cost: "", linkTo: "" };
          const setD = (patch: Partial<Draft>) =>
            setDrafts((prev) => ({ ...prev, [gap.normalized]: { ...d, ...patch } }));
          const isBusy = busy === gap.normalized;
          const candidates = [...menuItems]
            .filter((m) => m.is_active)
            .sort((a, b) => similarity(gap.label, b.name) - similarity(gap.label, a.name));
          return (
            <div key={gap.normalized} className="border border-gray-100 rounded-xl p-4 space-y-3">
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <p className="font-mono text-sm text-gray-800">{gap.rawSample}</p>
                <p className="text-xs text-gray-400">
                  vu sur {gap.orders} ticket{gap.orders > 1 ? "s" : ""}
                </p>
              </div>

              <div className="grid sm:grid-cols-[1fr_110px_110px_auto] gap-2 items-end">
                <label className="text-xs text-gray-500">
                  Nom au catalogue
                  <input
                    value={d.name}
                    onChange={(e) => setD({ name: e.target.value })}
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                  />
                </label>
                <label className="text-xs text-gray-500">
                  Prix de vente €
                  <input
                    type="number" step="0.1" min="0" inputMode="decimal"
                    value={d.price}
                    onChange={(e) => setD({ price: e.target.value })}
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                  />
                </label>
                <label className="text-xs text-gray-500">
                  Prix de revient €
                  <input
                    type="number" step="0.01" min="0" inputMode="decimal"
                    value={d.cost}
                    onChange={(e) => setD({ cost: e.target.value })}
                    placeholder="optionnel"
                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
                  />
                </label>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() =>
                    act(gap, { action: "add", name: d.name, menu_price: d.price, cost_price: d.cost === "" ? null : d.cost }, `« ${d.name} » ajouté au catalogue`)
                  }
                  className="px-4 py-2 bg-brand-red text-white rounded-lg text-sm font-semibold hover:bg-brand-red/85 disabled:opacity-60"
                >
                  Ajouter
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm">
                <select
                  value={d.linkTo}
                  onChange={(e) => setD({ linkTo: e.target.value })}
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white text-gray-700 max-w-[260px]"
                >
                  <option value="">— Produit existant du catalogue —</option>
                  {candidates.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={isBusy || d.linkTo === ""}
                  onClick={() => act(gap, { action: "link", menu_item_id: d.linkTo }, "Rattaché au catalogue")}
                  className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-200 disabled:opacity-50"
                >
                  Rattacher
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => act(gap, { action: "ignore" }, "Ligne ignorée (pas un produit)")}
                  className="ml-auto text-xs text-gray-400 hover:text-gray-600 underline disabled:opacity-50"
                >
                  Pas un produit → ignorer
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
