"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Team } from "@/types";

export function TransferForm({ teams }: { teams: Team[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filtered = teams.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  const selected = teams.find((t) => t.id === selectedId) ?? null;

  async function handleTransfer() {
    if (!selectedId) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to_team_id: selectedId }),
    });

    const data = await res.json();

    if (res.ok) {
      router.push("/dashboard");
      router.refresh();
      return;
    }

    setError(data.error ?? "Erreur inconnue.");
    setSubmitting(false);
    setConfirming(false);
  }

  if (confirming && selected) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h3 className="font-bold text-gray-900 mb-4">Confirmer le transfert</h3>
        <div className="bg-gray-50 rounded-xl p-4 flex items-center gap-3 mb-5">
          <span className="text-4xl">{selected.flag_emoji}</span>
          <div>
            <p className="font-bold text-gray-900">{selected.name}</p>
            <p className="text-sm text-green-600 font-medium">✓ Équipe active</p>
          </div>
        </div>

        <p className="text-sm text-gray-600 mb-5">
          Tu vas quitter ta communauté actuelle et rejoindre celle de{" "}
          <strong>{selected.name}</strong>. Cette action est enregistrée dans ton historique.
        </p>

        {error && (
          <p className="text-red-600 text-sm bg-red-50 px-4 py-3 rounded-lg mb-4">{error}</p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={submitting}
            className="flex-1 py-3 border border-gray-300 rounded-xl text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleTransfer}
            disabled={submitting}
            className="flex-1 bg-brand-red text-white py-3 rounded-xl font-semibold text-sm hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? "Transfert en cours..." : `Rejoindre ${selected.name} →`}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <h3 className="font-bold text-gray-900 mb-4">Choisir une nouvelle équipe</h3>

      {/* Recherche */}
      <input
        type="text"
        placeholder="Rechercher une équipe..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-red mb-4"
      />

      {/* Grille équipes */}
      <div className="grid grid-cols-2 gap-2 max-h-96 overflow-y-auto">
        {filtered.map((team) => (
          <button
            key={team.id}
            type="button"
            onClick={() => setSelectedId(team.id)}
            className={`flex items-center gap-2 p-3 rounded-xl border text-left transition-all ${
              selectedId === team.id
                ? "border-brand-red bg-red-50"
                : "border-gray-100 bg-gray-50 hover:border-gray-300"
            }`}
          >
            <span className="text-2xl shrink-0">{team.flag_emoji}</span>
            <span className={`text-sm font-medium truncate ${
              selectedId === team.id ? "text-brand-red" : "text-gray-800"
            }`}>
              {team.name}
            </span>
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-gray-400 text-sm py-4">Aucune équipe trouvée.</p>
      )}

      <button
        type="button"
        disabled={!selectedId}
        onClick={() => setConfirming(true)}
        className="w-full mt-4 bg-brand-dark text-white py-3 rounded-xl font-semibold text-sm hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {selectedId
          ? `Continuer avec ${teams.find((t) => t.id === selectedId)?.name} →`
          : "Sélectionne une équipe"}
      </button>
    </div>
  );
}
