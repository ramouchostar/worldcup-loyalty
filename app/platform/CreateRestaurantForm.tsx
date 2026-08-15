"use client";

import { useState } from "react";
import { createRestaurantAsSuperAdmin } from "./actions";

// Création directe d'un établissement par la plateforme (démarchage
// terrain). L'owner est optionnel — rattachable plus tard par email.
export function CreateRestaurantForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setLoading(true);
    setError(null);
    setSuccess(null);

    const result = await createRestaurantAsSuperAdmin(null, new FormData(form));
    setLoading(false);
    if (result.error) setError(result.error);
    if (result.success) {
      setSuccess(result.success);
      form.reset();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <input
          name="name"
          required
          placeholder="Nom de l'établissement"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <input
          name="sector"
          required
          placeholder="Secteur (ex : Molenbeek)"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>
      <input
        name="address"
        placeholder="Adresse (optionnel)"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
      />
      <input
        name="owner_email"
        type="email"
        placeholder="Email du restaurateur (optionnel — compte existant)"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
      />

      {/* ADR 0033 §1 — un établissement fictif suit exactement le même parcours
          qu'un vrai (c'est ce qui en fait une démonstration honnête) ; il est
          seulement retiré des surfaces publiques et des chiffres réseau. */}
      <label className="flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 cursor-pointer">
        <input type="checkbox" name="is_demo" className="mt-0.5 accent-brand-red" />
        <span className="text-sm text-gray-700">
          Compte démo
          <span className="block text-xs text-gray-400">
            Établissement fictif pour une démonstration : invisible sur l&apos;accueil, /secteurs
            et la liste « Choisis ton restaurant », exclu des chiffres réseau. Son URL{" "}
            <span className="font-mono">/r/…</span> reste accessible. Réversible à tout moment.
          </span>
        </span>
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-700">{success}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-brand-red text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-brand-red/85 disabled:opacity-50 transition-colors"
      >
        {loading ? "Création..." : "Créer l'établissement"}
      </button>
    </form>
  );
}
