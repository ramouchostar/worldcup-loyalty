"use client";

import { useEffect, useState } from "react";

type AdminTeam = {
  id: string;
  name: string;
  flag_emoji: string;
  country_code: string;
  is_active: boolean;
  round_reached: string;
  eliminated_at: string | null;
  community_scores: { member_count: number; total_spent: number; score: number } | null;
};

const ROUNDS = [
  { value: "group_stage",  label: "Phase de groupes" },
  { value: "round_of_32", label: "Seizièmes" },
  { value: "round_of_16", label: "Huitièmes" },
  { value: "quarter_final", label: "Quarts" },
  { value: "semi_final",  label: "Demi-finales" },
  { value: "final",       label: "Finale" },
  { value: "winner",      label: "Champion 🏆" },
] as const;

export default function AdminTeamsPage() {
  const [teams, setTeams] = useState<AdminTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "eliminated">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [editingRound, setEditingRound] = useState<string | null>(null);
  const [roundValue, setRoundValue] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncLog, setSyncLog] = useState<string[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  async function fetchTeams() {
    const res = await fetch("/api/admin/teams");
    if (res.ok) setTeams(await res.json());
    setLoading(false);
  }

  useEffect(() => { fetchTeams(); }, []);

  async function toggleActive(team: AdminTeam) {
    setBusy(team.id);
    await fetch("/api/admin/teams", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: team.id, is_active: !team.is_active }),
    });
    await fetchTeams();
    setBusy(null);
  }

  async function importSchedule() {
    setImporting(true);
    setImportResult(null);
    const res = await fetch("/api/admin/import-schedule", { method: "POST" });
    const data = await res.json();
    setImportResult(res.ok ? `✓ ${data.imported} matchs importés` : `✗ ${data.error}`);
    setImporting(false);
  }

  async function triggerSync() {
    setSyncing(true);
    setSyncLog(null);
    const res = await fetch("/api/admin/sync-wc2026", { method: "POST" });
    const data = await res.json();
    setSyncLog(data.log ?? [data.error ?? "Erreur inconnue"]);
    if (res.ok) await fetchTeams();
    setSyncing(false);
  }

  async function updateRound(id: string) {
    setBusy(id);
    await fetch("/api/admin/teams", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, round_reached: roundValue }),
    });
    setEditingRound(null);
    setRoundValue("");
    await fetchTeams();
    setBusy(null);
  }

  const filtered = teams.filter((t) =>
    filter === "all" ? true : filter === "active" ? t.is_active : !t.is_active
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Équipes</h1>
        <p className="text-gray-500 text-sm mt-1">
          Gérer les équipes : élimination, avancement au tour suivant.
        </p>
      </div>

      {/* Import calendrier — action unique */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-gray-800 text-sm">Importer le calendrier WC2026</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Action unique — récupère les 104 matchs (dates + heures) depuis football-data.org.
              À faire une seule fois avant le début du tournoi.
            </p>
          </div>
          <button
            onClick={importSchedule}
            disabled={importing}
            className="shrink-0 bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-900 disabled:opacity-50 transition-colors"
          >
            {importing ? "Import..." : "📅 Importer"}
          </button>
        </div>
        {importResult && (
          <p className={`mt-2 text-xs font-mono ${importResult.startsWith("✓") ? "text-green-700" : "text-red-600"}`}>
            {importResult}
          </p>
        )}
      </div>

      {/* Synchro FIFA */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-blue-900 text-sm">Synchronisation WC2026</p>
            <p className="text-xs text-blue-600 mt-0.5">
              Récupère les résultats depuis football-data.org et met à jour éliminations + avancements.
            </p>
          </div>
          <button
            onClick={triggerSync}
            disabled={syncing}
            className="shrink-0 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {syncing ? "Synchro..." : "⚽ Synchro"}
          </button>
        </div>
        {syncLog && (
          <div className="mt-3 bg-white rounded-lg border border-blue-100 p-3 max-h-40 overflow-y-auto">
            {syncLog.length === 0
              ? <p className="text-xs text-gray-400 italic">Aucun changement détecté.</p>
              : syncLog.map((line, i) => (
                  <p key={i} className={`text-xs font-mono ${
                    line.startsWith("✓") ? "text-green-700" :
                    line.startsWith("✗") ? "text-red-600" :
                    line.startsWith("⚠") ? "text-amber-600" : "text-gray-600"
                  }`}>{line}</p>
                ))
            }
          </div>
        )}
      </div>

      <div className="flex gap-2">
        {(["all", "active", "eliminated"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? "bg-brand-dark text-white"
                : "bg-white text-gray-600 border border-gray-200 hover:border-gray-400"
            }`}
          >
            {f === "all" ? "Toutes" : f === "active" ? "Actives" : "Éliminées"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl h-16 animate-pulse border border-gray-100" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((team) => {
            const score = team.community_scores;
            return (
              <div key={team.id} className={`bg-white rounded-xl border p-4 ${
                team.is_active ? "border-gray-100" : "border-red-100 opacity-75"
              }`}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{team.flag_emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`font-semibold text-sm ${team.is_active ? "text-gray-900" : "text-gray-500"}`}>
                        {team.name}
                      </p>
                      {!team.is_active && (
                        <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">éliminée</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">
                      {score?.member_count ?? 0} membres · score {Number(score?.score ?? 0).toLocaleString("fr-BE", { maximumFractionDigits: 0 })}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {editingRound === team.id ? (
                      <>
                        <select
                          value={roundValue}
                          onChange={(e) => setRoundValue(e.target.value)}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-red"
                        >
                          <option value="">-- Stade --</option>
                          {ROUNDS.map((r) => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => updateRound(team.id)}
                          disabled={!roundValue || busy === team.id}
                          className="text-xs bg-green-600 text-white px-2 py-1.5 rounded-lg disabled:opacity-50 hover:bg-green-700"
                        >
                          OK
                        </button>
                        <button
                          onClick={() => setEditingRound(null)}
                          className="text-xs border border-gray-200 text-gray-600 px-2 py-1.5 rounded-lg hover:bg-gray-50"
                        >
                          ✕
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => { setEditingRound(team.id); setRoundValue(team.round_reached); }}
                          className="text-xs border border-gray-200 text-gray-600 px-2 py-1.5 rounded-lg hover:bg-gray-50"
                        >
                          Stade
                        </button>
                        <button
                          onClick={() => toggleActive(team)}
                          disabled={busy === team.id}
                          className={`text-xs px-2 py-1.5 rounded-lg font-semibold disabled:opacity-50 ${
                            team.is_active
                              ? "bg-red-100 text-red-700 hover:bg-red-200"
                              : "bg-green-100 text-green-700 hover:bg-green-200"
                          }`}
                        >
                          {busy === team.id ? "..." : team.is_active ? "Éliminer" : "Réactiver"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
