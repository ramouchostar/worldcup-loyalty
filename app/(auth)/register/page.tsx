"use client";

import { useState } from "react";
import { registerProfile } from "./actions";

export default function RegisterPage() {
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) {
      setError("Entre ton prénom.");
      return;
    }

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.set("display_name", displayName.trim());

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
        Crée ton compte, puis tu choisiras ton restaurant et ton équipe.
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

        {error && <p className="text-red-600 text-sm bg-red-50 px-4 py-3 rounded-lg">{error}</p>}

        <button
          type="submit"
          disabled={loading || !displayName.trim()}
          className="w-full bg-brand-red text-white py-3 px-4 rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Création..." : "Créer mon compte"}
        </button>
      </form>
    </>
  );
}
