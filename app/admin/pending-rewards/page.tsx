"use client";

import { useEffect, useMemo, useState } from "react";
import type { PendingReward } from "@/types";

type AdminPendingReward = PendingReward & {
  profiles: { display_name: string; email: string } | null;
  orders: { amount: number; order_date: string } | null;
};

export default function AdminPendingRewardsPage() {
  const [rewards, setRewards] = useState<AdminPendingReward[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "redeemed">("pending");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function fetchRewards() {
    const res = await fetch("/api/admin/pending-rewards");
    if (res.ok) setRewards(await res.json());
    setLoading(false);
  }

  useEffect(() => { fetchRewards(); }, []);

  async function markRedeemed(id: string) {
    setBusy(id);
    const res = await fetch("/api/admin/pending-rewards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      alert("Erreur : " + (await res.json()).error);
    }
    await fetchRewards();
    setBusy(null);
  }

  const pending  = rewards.filter(r => r.status === "pending");
  const redeemed = rewards.filter(r => r.status === "redeemed");

  const counts = { pending: pending.length, redeemed: redeemed.length };

  // Résumé des items à distribuer (pending seulement)
  const distribution = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of pending) {
      for (const item of [r.solo_item, r.community_item, r.advancement_item]) {
        if (item) map[item] = (map[item] ?? 0) + 1;
      }
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [pending]);

  const filtered = (filter === "pending" ? pending : redeemed).filter(r => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.profiles?.display_name?.toLowerCase().includes(q) ||
      r.profiles?.email?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Récompenses en attente</h1>
        <p className="text-gray-500 text-sm mt-1">
          Marquez comme récupérée quand le membre passe au comptoir.
        </p>
      </div>

      {/* Résumé distribution */}
      {distribution.length > 0 && (
        <div className="bg-brand-gold/10 border border-brand-gold/30 rounded-2xl p-4">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
            🧾 À préparer ({pending.length} récompense{pending.length > 1 ? "s" : ""})
          </p>
          <div className="flex flex-wrap gap-2">
            {distribution.map(([item, count]) => (
              <span
                key={item}
                className="inline-flex items-center gap-1 bg-white border border-gray-200 text-gray-800 text-sm font-medium px-3 py-1 rounded-full shadow-sm"
              >
                <span className="font-bold text-brand-red">{count}×</span> {item}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filtres + recherche */}
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          {(["pending", "redeemed"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === f
                  ? "bg-brand-dark text-white"
                  : "bg-white text-gray-600 border border-gray-200 hover:border-gray-400"
              }`}
            >
              {f === "pending" ? "À récupérer" : "Récupérées"}
              <span className="ml-1.5 opacity-60">({counts[f]})</span>
            </button>
          ))}
        </div>

        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher par nom ou email..."
          className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-red text-gray-900 placeholder:text-gray-400"
        />
      </div>

      {/* Liste */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl h-20 animate-pulse border border-gray-100" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
          <p className="text-gray-400">
            {search ? "Aucun résultat pour cette recherche." :
             filter === "pending" ? "Aucune récompense en attente." : "Aucune récompense récupérée."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => (
            <div
              key={r.id}
              className={`bg-white rounded-xl border p-4 ${
                r.status === "pending" ? "border-brand-gold/40" : "border-gray-100 opacity-70"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="font-bold text-sm text-gray-900">
                      {r.profiles?.display_name ?? "—"}
                    </span>
                    <span className="text-xs text-gray-400">{r.profiles?.email}</span>
                  </div>

                  {/* Cadeaux par couche */}
                  <div className="space-y-1 mb-2">
                    {r.solo_item && (
                      <div className="flex items-center gap-1.5 text-sm">
                        <span>🍗</span>
                        <span className="font-medium text-gray-800">{r.solo_item}</span>
                        <span className="text-xs text-gray-400">— palier solo</span>
                      </div>
                    )}
                    {r.community_item && (
                      <div className="flex items-center gap-1.5 text-sm">
                        <span>👥</span>
                        <span className="font-medium text-gray-800">+ {r.community_item}</span>
                        <span className="text-xs text-gray-400">— bonus communautaire</span>
                      </div>
                    )}
                    {r.advancement_item && (
                      <div className="flex items-center gap-1.5 text-sm">
                        <span>🏆</span>
                        <span className="font-medium text-gray-800">+ {r.advancement_item}</span>
                        <span className="text-xs text-gray-400">— avancement</span>
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-gray-400">
                    Commande{" "}
                    {r.orders
                      ? `${Number(r.orders.amount).toLocaleString("fr-BE", { style: "currency", currency: "EUR" })} — ${new Date(r.orders.order_date).toLocaleDateString("fr-BE")}`
                      : "—"
                    }{" "}
                    · Généré le{" "}
                    {new Date(r.created_at).toLocaleDateString("fr-BE")}
                  </p>
                </div>

                {r.status === "pending" ? (
                  <button
                    onClick={() => markRedeemed(r.id)}
                    disabled={busy === r.id}
                    className="shrink-0 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    {busy === r.id ? "…" : "✓ Récupéré"}
                  </button>
                ) : (
                  <div className="shrink-0 text-right">
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
                      Récupéré ✓
                    </span>
                    {r.redeemed_at && (
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(r.redeemed_at).toLocaleDateString("fr-BE")}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
