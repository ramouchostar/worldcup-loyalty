"use client";

import { useState } from "react";
import { createPartnerRestaurant } from "./actions";
import { TrackOnMount } from "@/components/analytics/TrackOnMount";
import { queueEvent } from "@/lib/analytics-pending";
import {
  MAX_SUGGESTIONS,
  SUGGESTION_TYPES,
  normalizeSuggestionName,
  suggestionKey,
  teamTypeEmoji,
} from "@/lib/team-suggestions";
import type { TeamType } from "@/types";

const MAX_CUISINE_TYPES = 5;

type Community = { name: string; type: TeamType };

export default function BecomeAPartnerPage() {
  const [name, setName] = useState("");
  const [sector, setSector] = useState("");
  const [address, setAddress] = useState("");
  const [cuisineTypes, setCuisineTypes] = useState<string[]>([]);
  const [cuisineInput, setCuisineInput] = useState("");
  // ADR 0031 — communautés d'où viennent réellement les clients
  const [communities, setCommunities] = useState<Community[]>([]);
  const [communityName, setCommunityName] = useState("");
  const [communityType, setCommunityType] = useState<TeamType>("ecole");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addCommunity() {
    const clean = normalizeSuggestionName(communityName);
    if (!clean) return;
    if (communities.length >= MAX_SUGGESTIONS) return;
    if (communities.some((c) => suggestionKey(c.name) === suggestionKey(clean))) return;
    setCommunities([...communities, { name: clean, type: communityType }]);
    setCommunityName("");
  }

  function removeCommunity(value: string) {
    setCommunities(communities.filter((c) => c.name !== value));
  }

  function handleCommunityKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addCommunity();
    }
  }

  function addCuisineType() {
    const value = cuisineInput.trim();
    if (!value) return;
    if (cuisineTypes.length >= MAX_CUISINE_TYPES) return;
    if (cuisineTypes.some((t) => t.toLowerCase() === value.toLowerCase())) return;
    setCuisineTypes([...cuisineTypes, value]);
    setCuisineInput("");
  }

  function removeCuisineType(value: string) {
    setCuisineTypes(cuisineTypes.filter((t) => t !== value));
  }

  function handleCuisineKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addCuisineType();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Entre le nom de ton restaurant.");
      return;
    }
    if (!sector.trim()) {
      setError("Indique ta ville ou ton quartier.");
      return;
    }

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.set("name", name.trim());
    formData.set("sector", sector.trim());
    formData.set("address", address.trim());
    cuisineTypes.forEach((t) => formData.append("cuisine_types", t));
    communities.forEach((c) => formData.append("communities", JSON.stringify(c)));

    // L'action redirige vers l'étape 2 en cas de succès — l'événement passe
    // donc par la file (lib/analytics-pending.ts).
    queueEvent("partner_step_completed", { step_name: "compte", step_number: 1 });

    const result = await createPartnerRestaurant(null, formData);

    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
    // si pas d'erreur, createPartnerRestaurant redirige vers l'étape 2 (menu)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 py-10">
      {/* Entrée du tunnel restaurateur — dénominateur des 4 étapes. */}
      <TrackOnMount event="partner_signup_started" params={{ source: "formulaire" }} />
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <p className="text-4xl mb-2">🍗</p>
          <h1 className="text-2xl font-bold text-gray-900">Rejoins le réseau en tant que restaurateur</h1>
          <p className="text-gray-500 text-sm mt-1">
            Étape 1/4 — présente ton établissement. Il restera invisible aux clients
            jusqu&apos;à validation par notre équipe.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl p-8 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom du restaurant</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex : Pizzeria Da Mario"
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red text-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ville / quartier</label>
            <p className="text-xs text-gray-500 mb-2">
              Le secteur où tes clients te trouvent — il apparaît sur la page publique d&apos;activité du réseau.
            </p>
            <input
              type="text"
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              placeholder="Ex : Molenbeek"
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red text-gray-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Adresse</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Ex : Rue de la Loi 12, 1000 Bruxelles"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red text-gray-900 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Types de cuisine <span className="text-gray-400 font-normal">({cuisineTypes.length}/{MAX_CUISINE_TYPES})</span>
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Sois précis — ex. <span className="font-medium text-gray-700">&laquo;&nbsp;Pizza napolitaine&nbsp;&raquo;</span> plutôt
              que juste <span className="font-medium text-gray-700">&laquo;&nbsp;Italien&nbsp;&raquo;</span>. C&apos;est ce qui aide
              les clients à te trouver.
            </p>
            <div className="flex flex-wrap gap-2 mb-2">
              {cuisineTypes.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1.5 bg-red-50 text-brand-red text-xs font-semibold px-3 py-1.5 rounded-full"
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => removeCuisineType(t)}
                    className="text-brand-red/60 hover:text-brand-red"
                    aria-label={`Retirer ${t}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            {cuisineTypes.length < MAX_CUISINE_TYPES && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={cuisineInput}
                  onChange={(e) => setCuisineInput(e.target.value)}
                  onKeyDown={handleCuisineKeyDown}
                  placeholder="Ex : Burger artisanal"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red text-gray-900 text-sm"
                />
                <button
                  type="button"
                  onClick={addCuisineType}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
                >
                  Ajouter
                </button>
              </div>
            )}
          </div>

          {/* ADR 0031 — c'est le restaurateur qui connaît le mieux sa clientèle.
              Ces noms restent privés tant qu'aucun membre ne s'y reconnaît :
              on ne publie jamais le nom d'un tiers de sa propre initiative. */}
          <div className="border-t border-gray-100 pt-5">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              D&apos;où viennent tes clients ?{" "}
              <span className="text-gray-400 font-normal">({communities.length}/{MAX_SUGGESTIONS})</span>
            </label>
            <p className="text-xs text-gray-500 mb-3">
              Cite les écoles, entreprises et quartiers que tu vois passer le plus.
              À l&apos;inscription, on demande à chaque client{" "}
              <span className="font-medium text-gray-700">&laquo;&nbsp;te reconnais-tu ici&nbsp;?&nbsp;&raquo;</span> —
              il rejoint son équipe en un tap au lieu d&apos;avoir à en créer une.
              Rien n&apos;est publié tant que personne ne s&apos;y reconnaît, et tu
              pourras modifier cette liste à tout moment.
            </p>

            <div className="flex flex-wrap gap-2 mb-2">
              {communities.map((c) => (
                <span
                  key={c.name}
                  className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-800 text-xs font-semibold px-3 py-1.5 rounded-full"
                >
                  <span aria-hidden="true">{teamTypeEmoji(c.type)}</span>
                  {c.name}
                  <button
                    type="button"
                    onClick={() => removeCommunity(c.name)}
                    className="text-gray-400 hover:text-gray-700"
                    aria-label={`Retirer ${c.name}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>

            {communities.length < MAX_SUGGESTIONS && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={communityName}
                    onChange={(e) => setCommunityName(e.target.value)}
                    onKeyDown={handleCommunityKeyDown}
                    placeholder={
                      SUGGESTION_TYPES.find((t) => t.value === communityType)?.hint ?? "Nom"
                    }
                    maxLength={60}
                    className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red text-gray-900 text-sm"
                  />
                  <button
                    type="button"
                    onClick={addCommunity}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 shrink-0"
                  >
                    Ajouter
                  </button>
                </div>
                <select
                  value={communityType}
                  onChange={(e) => setCommunityType(e.target.value as TeamType)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900"
                >
                  {SUGGESTION_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {teamTypeEmoji(t.value)} {t.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {error && <p className="text-red-600 text-sm bg-red-50 px-4 py-3 rounded-lg">{error}</p>}

          <button
            type="submit"
            disabled={loading || !name.trim() || !sector.trim()}
            className="w-full bg-brand-red text-white py-3 px-4 rounded-lg font-semibold hover:bg-brand-red/85 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Création..." : "Continuer →"}
          </button>
        </form>
      </div>
    </div>
  );
}
