"use client";

import { useEffect, useState } from "react";
import type { PendingReward } from "@/types";

type AdminPendingReward = PendingReward & {
  profiles: { display_name: string; email: string } | null;
  orders: { amount: number; order_date: string } | null;
};

export default function AdminPendingRewardsPage() {
  const [rewards, setRewards] = useState<AdminPendingReward[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "redeemed">("pending");
  const [busy, setBusy] = useState<string | null>(null);

  async function fetchRewards() {
    const res = await fetch("/api/admin/pending-rewards");
    if (res.ok) setRewards(await res.json());
    setLoading(false);
  }

  useEffect(() => { fetchRewards(); }, []);

  async function markRedeemed(id: string) {
    setBusy(id);
    await fetch("/api/admin/pending-rewards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await fetchRewards();
    setBusy(null);
  }

  const filtered = rewards.filter(r => r.status === filter);
  const counts = {
    pending:  rewards.filter(r => r.status === "pending").length,
    redeemed: rewards.filter(r => r.status === "redeemed").length,
  };

  function giftLine(r: AdminPendingReward) {
    return [r.solo_item, r.community_item, r.advancement_item]
      .filter(Boolean)
      .join(" + ");
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Récompenses en attente</h1>
        <p className="text-gray-500 text-sm mt-1">
          Marquez comme récupérée quand le membre passe au comptoir.
        </p>
      </div>

      {/* Filters */}
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

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl h-20 animate-pulse border border-gray-100" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
          <p className="text-gray-400">
            {filter === "pending" ? "Aucune récompense en attente." : "Aucune récompense récupérée."}
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
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-semibold text-sm text-gray-900">
                      {r.profiles?.display_name ?? "—"}
                    </span>
                    <span className="text-xs text-gray-400">{r.profiles?.email}</span>
                  </div>

                  {/* Cadeaux empilés */}
                  <div className="space-y-1 mb-2">
                    {r.solo_item && (
                      <div className="flex items-center gap-1.5 text-sm">
                        <span className="text-base">🍗</span>
                        <span className="font-medium text-gray-800">{r.solo_item}</span>
                        <span className="text-xs text-gray-400">— palier solo</span>
                      </div>
                    )}
                    {r.community_item && (
                      <div className="flex items-center gap-1.5 text-sm">
                        <span className="text-base">👥</span>
                        <span className="font-medium text-gray-800">+ {r.community_item}</span>
                        <span className="text-xs text-gray-400">— bonus communautaire</span>
                      </div>
                    )}
                    {r.advancement_item && (
                      <div className="flex items-center gap-1.5 text-sm">
                        <span className="text-base">🏆</span>
                        <span className="font-medium text-gray-800">+ {r.advancement_item}</span>
                        <span className="text-xs text-gray-400">— avancement</span>
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-gray-400">
                    Commande{" "}
                    {r.orders
                      ? `${Number(r.orders.amount).toLocaleString("fr-BE", { style: "currency", currency: "EUR" })} — ${new Date(r.orders.order_date).toLocaleDateString("fr-BE")}`
                      : "—"}{" "}
                    · Généré le{" "}
                    {new Date(r.created_at).toLocaleDateString("fr-BE")}
                  </p>
                </div>

                {r.status === "pending" ? (
                  <button
                    onClick={() => markRedeemed(r.id)}
                    disabled={busy === r.id}
                    className="shrink-0 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 disabled:opacity-50"
                  >
                    {busy === r.id ? "…" : "✓ Récupéré"}
                  </button>
                ) : (
                  <span className="shrink-0 text-xs font-bold px-2.5 py-1 rounded-full bg-gray-100 text-gray-500">
                    Récupéré ✓
                    {r.redeemed_at && (
                      <span className="block text-gray-400 font-normal">
                        {new Date(r.redeemed_at).toLocaleDateString("fr-BE")}
                      </span>
                    )}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
