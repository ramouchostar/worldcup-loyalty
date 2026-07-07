"use client";

import { useState } from "react";
import { updateRestaurantInfo } from "./actions";

type Initial = {
  name: string;
  sector: string;
  address: string;
  cuisine_types: string;
  google_maps_url: string;
  instagram_url: string;
  tiktok_url: string;
  facebook_url: string;
};

const SOCIAL_FIELDS: { name: keyof Initial; label: string; placeholder: string }[] = [
  { name: "google_maps_url", label: "⭐ Google Maps (avis)", placeholder: "https://maps.app.goo.gl/..." },
  { name: "instagram_url", label: "📸 Instagram", placeholder: "https://instagram.com/..." },
  { name: "tiktok_url", label: "🎵 TikTok", placeholder: "https://tiktok.com/@..." },
  { name: "facebook_url", label: "👍 Facebook", placeholder: "https://facebook.com/..." },
];

export function SettingsForm({ restaurantId, initial }: { restaurantId: string; initial: Initial }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const result = await updateRestaurantInfo(restaurantId, null, new FormData(e.currentTarget));
    setLoading(false);
    if (result.error) setMessage({ kind: "error", text: result.error });
    if (result.success) setMessage({ kind: "success", text: result.success });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        <h2 className="font-bold text-gray-900">Identité</h2>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Nom de l&apos;établissement
          </label>
          <input
            name="name"
            required
            defaultValue={initial.name}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <p className="text-xs text-gray-400 mt-1">
            L&apos;adresse de ta page (<span className="font-mono">/r/{restaurantId}</span>) ne change
            pas — tes QR codes imprimés restent valables.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Secteur (ville / quartier)
            </label>
            <input
              name="sector"
              required
              defaultValue={initial.sector}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Adresse
            </label>
            <input
              name="address"
              defaultValue={initial.address}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Types de cuisine (séparés par des virgules, max 5)
          </label>
          <input
            name="cuisine_types"
            defaultValue={initial.cuisine_types}
            placeholder="Ex : Burger artisanal, Halal, Dessert"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        <div>
          <h2 className="font-bold text-gray-900">Liens sociaux</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Utilisés par les actions sociales de tes membres (jetons) — un lien
            vide masque le bouton correspondant.
          </p>
        </div>
        {SOCIAL_FIELDS.map((f) => (
          <div key={f.name}>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              {f.label}
            </label>
            <input
              name={f.name}
              type="url"
              defaultValue={initial[f.name]}
              placeholder={f.placeholder}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        ))}
      </div>

      {message && (
        <p className={`text-sm ${message.kind === "error" ? "text-red-600" : "text-green-700"}`}>
          {message.text}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-brand-red text-white py-3 rounded-xl font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
      >
        {loading ? "Enregistrement..." : "Enregistrer"}
      </button>
    </form>
  );
}
