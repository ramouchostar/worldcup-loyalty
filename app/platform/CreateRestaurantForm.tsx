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
