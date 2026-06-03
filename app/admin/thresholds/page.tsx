"use client";

import { useEffect, useState } from "react";

type Threshold = {
  id: string;
  period_label: string;
  target_revenue: number;
  current_revenue: number;
  is_unlocked: boolean;
  unlocked_at: string | null;
  created_at: string;
};

export default function AdminThresholdsPage() {
  const [thresholds, setThresholds] = useState<Threshold[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRevenue, setEditRevenue] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newTarget, setNewTarget] = useState("");
  const [creating, setCreating] = useState(false);

  async function fetchThresholds() {
    const res = await fetch("/api/admin/thresholds");
    if (res.ok) setThresholds(await res.json());
    setLoading(false);
  }

  useEffect(() => { fetchThresholds(); }, []);

  async function updateRevenue(id: string) {
    setBusy(id);
    await fetch("/api/admin/thresholds", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, current_revenue: Number(editRevenue) }),
    });
    setEditingId(null);
    setEditRevenue("");
    await fetchThresholds();
    setBusy(null);
  }

  async function toggleUnlock(t: Threshold) {
    setBusy(t.id);
    await fetch("/api/admin/thresholds", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: t.id, is_unlocked: !t.is_unlocked }),
    });
    await fetchThresholds();
    setBusy(null);
  }

  async function createThreshold() {
    if (!newLabel.trim() || !newTarget) return;
    setCreating(true);
    await fetch("/api/admin/thresholds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ period_label: newLabel, target_revenue: Number(newTarget) }),
    });
    setShowNew(false);
    setNewLabel("");
    setNewTarget("");
    await fetchThresholds();
    setCreating(false);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Seuils CA Restaurant</h1>
          <p className="text-gray-500 text-sm mt-1">
            Gérer les objectifs de chiffre d&apos;affaires et débloquer les récompenses.
          </p>
        </div>
        <button
          onClick={() => setShowNew(!showNew)}
          className="px-4 py-2 bg-brand-dark text-white rounded-lg text-sm font-semibold hover:bg-gray-800 transition-colors"
        >
          + Nouveau seuil
        </button>
      </div>

      {/* Formulaire nouveau seuil */}
      {showNew && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <h3 className="font-semibold text-blue-900 text-sm">Nouveau seuil de CA</h3>
          <input
            type="text"
            placeholder="Label (ex : Phase de groupes — Semaine 2)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-red"
          />
          <input
            type="number"
            placeholder="Objectif CA (€)"
            value={newTarget}
            onChange={(e) => setNewTarget(e.target.value)}
            min="1"
            className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-red"
          />
          <div className="flex gap-2">
            <button
              onClick={createThreshold}
              disabled={creating || !newLabel.trim() || !newTarget}
              className="px-4 py-2 bg-brand-red text-white rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-red-700"
            >
              {creating ? "Création..." : "Créer"}
            </button>
            <button
              onClick={() => setShowNew(false)}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="bg-white rounded-xl h-32 animate-pulse border border-gray-100" />)}
        </div>
      ) : (
        <div className="space-y-4">
          {thresholds.map((t) => {
            const pct = Math.min(100, Math.round((t.current_revenue / t.target_revenue) * 100));
            return (
              <div key={t.id} className={`bg-white rounded-xl border p-5 ${
                t.is_unlocked ? "border-green-300" : "border-gray-100"
              }`}>
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <h3 className="font-bold text-gray-900">{t.period_label}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Créé le {new Date(t.created_at).toLocaleDateString("fr-BE")}
                      {t.unlocked_at && ` · Débloqué le ${new Date(t.unlocked_at).toLocaleDateString("fr-BE")}`}
                    </p>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${
                    t.is_unlocked ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
                  }`}>
                    {t.is_unlocked ? "🔓 Débloqué" : "🔒 Verrouillé"}
                  </span>
                </div>

                {/* Barre CA */}
                <div className="mb-4">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>
                      CA actuel :{" "}
                      <strong>{Number(t.current_revenue).toLocaleString("fr-BE", { style: "currency", currency: "EUR" })}</strong>
                    </span>
                    <span>
                      Objectif :{" "}
                      <strong>{Number(t.target_revenue).toLocaleString("fr-BE", { style: "currency", currency: "EUR" })}</strong>
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all ${t.is_unlocked ? "bg-green-500" : "bg-brand-red"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1 text-right">{pct}%</p>
                </div>

                {/* Actions */}
                <div className="flex gap-2 flex-wrap">
                  {editingId === t.id ? (
                    <>
                      <input
                        type="number"
                        value={editRevenue}
                        onChange={(e) => setEditRevenue(e.target.value)}
                        placeholder="Nouveau CA (€)"
                        min="0"
                        className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-red"
                      />
                      <button
                        onClick={() => updateRevenue(t.id)}
                        disabled={!editRevenue || busy === t.id}
                        className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-green-700"
                      >
                        Enregistrer
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50"
                      >
                        Annuler
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => { setEditingId(t.id); setEditRevenue(String(t.current_revenue)); }}
                        className="px-3 py-1.5 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
                      >
                        Mettre à jour le CA
                      </button>
                      <button
                        onClick={() => toggleUnlock(t)}
                        disabled={busy === t.id}
                        className={`px-3 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-50 ${
                          t.is_unlocked
                            ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                            : "bg-green-600 text-white hover:bg-green-700"
                        }`}
                      >
                        {busy === t.id ? "..." : t.is_unlocked ? "Reverrouiller" : "🔓 Débloquer manuellement"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
