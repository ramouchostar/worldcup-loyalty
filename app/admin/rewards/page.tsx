"use client";

import { useEffect, useState } from "react";
import type { Reward } from "@/types";

type EditState = Partial<Pick<Reward, "title" | "description" | "gift_details" | "score_threshold" | "cost_euros" | "min_member_count" | "is_active">>;

export default function AdminRewardsPage() {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<string, EditState>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function fetchRewards() {
    const res = await fetch("/api/admin/rewards");
    if (res.ok) setRewards(await res.json());
    setLoading(false);
  }

  useEffect(() => { fetchRewards(); }, []);

  function startEdit(r: Reward) {
    setEditing((prev) => ({
      ...prev,
      [r.id]: {
        title: r.title,
        description: r.description,
        gift_details: r.gift_details ?? "",
        score_threshold: r.score_threshold,
        cost_euros: r.cost_euros,
        min_member_count: r.min_member_count,
        is_active: r.is_active,
      },
    }));
  }

  function cancelEdit(id: string) {
    setEditing((prev) => { const next = { ...prev }; delete next[id]; return next; });
  }

  async function saveReward(id: string) {
    setSaving(id);
    setError(null);
    const updates = editing[id];
    const res = await fetch("/api/admin/rewards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    });
    if (res.ok) {
      cancelEdit(id);
      await fetchRewards();
    } else {
      const body = await res.json();
      setError(body.error ?? "Erreur lors de la sauvegarde.");
    }
    setSaving(null);
  }

  async function toggleActive(r: Reward) {
    setSaving(r.id);
    await fetch("/api/admin/rewards", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: r.id, is_active: !r.is_active }),
    });
    await fetchRewards();
    setSaving(null);
  }

  function field<K extends keyof EditState>(id: string, key: K, value: EditState[K]) {
    setEditing((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Paliers de récompenses</h1>
        <p className="text-gray-500 text-sm mt-1">
          Cliquez sur &quot;Modifier&quot; pour éditer un palier. Le palier 5 nécessite un minimum de membres.
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
        <p className="font-semibold mb-1">Double verrou</p>
        <p>
          Les récompenses se débloquent si <strong>score ≥ seuil</strong> ET{" "}
          <strong>objectif CA restaurant atteint</strong> (
          <a href="/admin/thresholds" className="underline font-medium">Seuils CA</a>).
          Le Family Bucket (palier 5) exige en plus un minimum de membres actifs.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="bg-white rounded-xl h-20 animate-pulse border border-gray-100" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {rewards.map((r) => {
            const isEditing = !!editing[r.id];
            const ed = editing[r.id] ?? {};

            return (
              <div
                key={r.id}
                className={`bg-white rounded-xl border p-5 ${r.is_active ? "border-gray-100" : "border-red-100 opacity-70"}`}
              >
                {isEditing ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-8 h-8 bg-brand-gold/20 border border-brand-gold/40 rounded-lg flex items-center justify-center text-brand-gold font-black text-sm shrink-0">
                        P{r.level}
                      </span>
                      <span className="text-sm font-semibold text-gray-700">Édition palier {r.level}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Titre</label>
                        <input
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                          value={ed.title ?? ""}
                          onChange={(e) => field(r.id, "title", e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Seuil de score</label>
                        <input
                          type="number"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                          value={ed.score_threshold ?? 0}
                          onChange={(e) => field(r.id, "score_threshold", Number(e.target.value))}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Description</label>
                      <input
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                        value={ed.description ?? ""}
                        onChange={(e) => field(r.id, "description", e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Détail cadeau</label>
                      <input
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                        value={ed.gift_details ?? ""}
                        onChange={(e) => field(r.id, "gift_details", e.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Coût (€)</label>
                        <input
                          type="number"
                          step="0.01"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                          value={ed.cost_euros ?? 0}
                          onChange={(e) => field(r.id, "cost_euros", Number(e.target.value))}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">Min. membres (0 = aucun)</label>
                        <input
                          type="number"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                          value={ed.min_member_count ?? 0}
                          onChange={(e) => field(r.id, "min_member_count", Number(e.target.value))}
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                      <button
                        onClick={() => saveReward(r.id)}
                        disabled={saving === r.id}
                        className="px-4 py-2 bg-brand-dark text-white rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50"
                      >
                        {saving === r.id ? "Enregistrement…" : "Enregistrer"}
                      </button>
                      <button
                        onClick={() => cancelEdit(r.id)}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="w-8 h-8 bg-brand-gold/20 border border-brand-gold/40 rounded-lg flex items-center justify-center text-brand-gold font-black text-sm shrink-0">
                        P{r.level}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-bold text-gray-900">{r.title}</h3>
                          {!r.is_active && (
                            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">inactif</span>
                          )}
                          {r.min_member_count > 0 && (
                            <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                              👥 min. {r.min_member_count} membres
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">{r.description}</p>
                        {r.gift_details && (
                          <p className="text-sm text-brand-red font-medium mt-1">🎁 {r.gift_details}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0 space-y-2">
                      <div>
                        <p className="text-xs text-gray-400">Seuil</p>
                        <p className="font-black text-gray-900 tabular-nums">
                          {Number(r.score_threshold).toLocaleString("fr-BE", { maximumFractionDigits: 0 })}
                        </p>
                        <p className="text-xs text-gray-400">
                          {Number(r.cost_euros).toLocaleString("fr-BE", { style: "currency", currency: "EUR" })}
                        </p>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => startEdit(r)}
                          className="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
                        >
                          Modifier
                        </button>
                        <button
                          onClick={() => toggleActive(r)}
                          disabled={saving === r.id}
                          className={`text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-50 ${
                            r.is_active
                              ? "bg-red-50 text-red-700 hover:bg-red-100"
                              : "bg-green-50 text-green-700 hover:bg-green-100"
                          }`}
                        >
                          {saving === r.id ? "…" : r.is_active ? "Désactiver" : "Activer"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
