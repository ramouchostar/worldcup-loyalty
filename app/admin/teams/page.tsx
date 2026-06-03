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
