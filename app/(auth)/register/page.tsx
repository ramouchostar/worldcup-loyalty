"use client";

import { useState } from "react";
import { registerProfile } from "./actions";
import { sanitizeZones } from "@/lib/zones";

export default function RegisterPage() {
  const [displayName, setDisplayName] = useState("");
  const [zoneHome, setZoneHome] = useState("");
  const [zoneWork, setZoneWork] = useState("");
  const [zoneSchool, setZoneSchool] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) {
      setError("Entre ton prénom.");
      return;
    }
    // ADR 0018 — au moins la zone où tu vis, pour la découverte d'équipes
    const zones = sanitizeZones([zoneHome, zoneWork, zoneSchool]);
    if (zones.length === 0) {
      setError("Indique au moins ta zone (ville ou quartier où tu vis).");
      return;
    }

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.set("display_name", displayName.trim());
    zones.forEach((z) => formData.append("zones", z));

    const result = await registerProfile(null, formData);

    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
    // si pas d'erreur, registerProfile redirige vers /join côté serveur
  }

  return (
    <>
      <h2 className="text-xl font-bold text-gray-900 mb-1">Rejoindre le programme</h2>
      <p className="text-gray-500 text-sm mb-6">
        Complète ton profil — on te proposera ensuite les équipes actives dans tes zones.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ton prénom</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Ex: Karim"
            required
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red text-gray-900"
          />
        </div>

        {/* ADR 0018 — zones du membre */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ta zone (ville ou quartier)</label>
          <input
            type="text"
            value={zoneHome}
            onChange={(e) => setZoneHome(e.target.value)}
            placeholder="Ex : Molenbeek"
            required
            maxLength={40}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red text-gray-900"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Zone de travail <span className="text-gray-400 font-normal">(facultatif)</span>
            </label>
            <input
              type="text"
              value={zoneWork}
              onChange={(e) => setZoneWork(e.target.value)}
              placeholder="Ex : Anderlecht"
              maxLength={40}
              className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Zone d&apos;école <span className="text-gray-400 font-normal">(facultatif)</span>
            </label>
            <input
              type="text"
              value={zoneSchool}
              onChange={(e) => setZoneSchool(e.target.value)}
              placeholder="Ex : Ixelles"
              maxLength={40}
              className="w-full px-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red text-gray-900"
            />
          </div>
        </div>

        {error && <p className="text-red-600 text-sm bg-red-50 px-4 py-3 rounded-lg">{error}</p>}

        <button
          type="submit"
          disabled={loading || !displayName.trim()}
          className="w-full bg-brand-red text-white py-3 px-4 rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Création..." : "Continuer"}
        </button>
      </form>
    </>
  );
}
