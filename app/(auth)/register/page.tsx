"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { registerTeam } from "./actions";
import type { Team } from "@/types";

const RESTAURANTS = [
  { id: "kraainem",    label: "Kraainem",    address: "Av. de Wezembeek 73" },
  { id: "houba",       label: "Houba",       address: "Bd Auguste Reyers 68" },
  { id: "uccle-de-bue", label: "Uccle De Bue", address: "Rue De Bue 38" },
];

export default function RegisterPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [selectedRestaurant, setSelectedRestaurant] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("teams")
      .select("*")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => {
        if (data) setTeams(data as Team[]);
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedRestaurant) {
      setError("Choisis ton Belchicken.");
      return;
    }
    if (!selectedTeam || !displayName.trim()) {
      setError("Choisis une équipe et entre ton prénom.");
      return;
    }

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.set("team_id", selectedTeam);
    formData.set("display_name", displayName.trim());
    formData.set("restaurant_id", selectedRestaurant);

    const result = await registerTeam(null, formData);

    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
    // si pas d'erreur, registerTeam appelle redirect("/dashboard") côté serveur
  }

  return (
    <>
      <h2 className="text-xl font-bold text-gray-900 mb-1">Rejoindre le programme</h2>
      <p className="text-gray-500 text-sm mb-6">
        Choisis l&apos;équipe que tu soutiens — tu pourras transférer si elle est éliminée.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Ton prénom
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Ex: Karim"
            required
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red text-gray-900"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Ton Belchicken <span className="text-brand-red">*</span>
          </label>
          <div className="flex flex-col gap-2">
            {RESTAURANTS.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedRestaurant(r.id)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all text-left ${
                  selectedRestaurant === r.id
                    ? "border-brand-red bg-red-50 text-brand-red"
                    : "border-gray-200 text-gray-700 hover:border-gray-400"
                }`}
              >
                <span className="text-xl">🍗</span>
                <div>
                  <p className="font-semibold">{r.label}</p>
                  <p className="text-xs text-gray-500 font-normal">{r.address}</p>
                </div>
                {selectedRestaurant === r.id && (
                  <span className="ml-auto text-brand-red font-bold">✓</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Ton équipe
          </label>
          {teams.length === 0 ? (
            <p className="text-gray-400 text-sm">Chargement des équipes...</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
              {teams.map((team) => (
                <button
                  key={team.id}
                  type="button"
                  onClick={() => setSelectedTeam(team.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all text-left ${
                    selectedTeam === team.id
                      ? "border-brand-red bg-red-50 text-brand-red"
                      : "border-gray-200 text-gray-700 hover:border-gray-400"
                  }`}
                >
                  <span className="text-xl">{team.flag_emoji}</span>
                  <span className="truncate">{team.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {error && (
          <p className="text-red-600 text-sm bg-red-50 px-4 py-3 rounded-lg">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading || !selectedRestaurant || !selectedTeam || !displayName.trim()}
          className="w-full bg-brand-red text-white py-3 px-4 rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Enregistrement..." : "Rejoindre le programme 🏆"}
        </button>
      </form>
    </>
  );
}
