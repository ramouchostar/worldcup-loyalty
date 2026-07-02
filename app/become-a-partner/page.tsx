"use client";

import { useState } from "react";
import { createPartnerRestaurant } from "./actions";

const MAX_CUISINE_TYPES = 5;

export default function BecomeAPartnerPage() {
  const [name, setName] = useState("");
  const [sector, setSector] = useState("");
  const [address, setAddress] = useState("");
  const [cuisineTypes, setCuisineTypes] = useState<string[]>([]);
  const [cuisineInput, setCuisineInput] = useState("");
  const [googleMapsUrl, setGoogleMapsUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [tiktokUrl, setTiktokUrl] = useState("");
  const [facebookUrl, setFacebookUrl] = useState("");
  const [showSocialHelp, setShowSocialHelp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    formData.set("google_maps_url", googleMapsUrl.trim());
    formData.set("instagram_url", instagramUrl.trim());
    formData.set("tiktok_url", tiktokUrl.trim());
    formData.set("facebook_url", facebookUrl.trim());

    const result = await createPartnerRestaurant(null, formData);

    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
    // si pas d'erreur, createPartnerRestaurant redirige vers l'étape 2 (menu)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <p className="text-4xl mb-2">🍗</p>
          <h1 className="text-2xl font-bold text-gray-900">Rejoins le réseau en tant que restaurateur</h1>
          <p className="text-gray-500 text-sm mt-1">
            Étape 1/2 — présente ton établissement. Il restera invisible aux clients
            jusqu&apos;à validation par notre équipe.
          </p>
          <a href="/secteurs" className="inline-block text-xs font-semibold text-brand-red hover:underline mt-2">
            Vois l&apos;activité du réseau dans ton secteur →
          </a>
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

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">Réseaux sociaux (optionnel)</label>
              <button
                type="button"
                onClick={() => setShowSocialHelp((v) => !v)}
                className="text-xs font-semibold text-brand-red hover:underline"
              >
                {showSocialHelp ? "Masquer l'aide" : "Comment trouver mon lien ?"}
              </button>
            </div>
            {showSocialHelp && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3 text-xs text-blue-900 space-y-1">
                <p>
                  📱 Sur l&apos;appli (Instagram, TikTok, Facebook) : va sur <strong>ton profil</strong>, appuie sur{" "}
                  <strong>&laquo;&nbsp;Partager le profil&nbsp;&raquo;</strong> puis <strong>&laquo;&nbsp;Copier le lien&nbsp;&raquo;</strong>.
                </p>
                <p>💻 Sur ordinateur : ouvre ton profil et copie l&apos;adresse dans la barre du navigateur.</p>
                <p>Colle ensuite ce lien tel quel ci-dessous.</p>
              </div>
            )}

            <div className="space-y-3">
              <input
                type="url"
                value={googleMapsUrl}
                onChange={(e) => setGoogleMapsUrl(e.target.value)}
                placeholder="Lien Google Maps"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red text-gray-900 text-sm"
              />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="url"
                  value={instagramUrl}
                  onChange={(e) => setInstagramUrl(e.target.value)}
                  placeholder="Instagram"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red text-gray-900 text-xs"
                />
                <input
                  type="url"
                  value={tiktokUrl}
                  onChange={(e) => setTiktokUrl(e.target.value)}
                  placeholder="TikTok"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red text-gray-900 text-xs"
                />
                <input
                  type="url"
                  value={facebookUrl}
                  onChange={(e) => setFacebookUrl(e.target.value)}
                  placeholder="Facebook"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red text-gray-900 text-xs"
                />
              </div>
            </div>
          </div>

          {error && <p className="text-red-600 text-sm bg-red-50 px-4 py-3 rounded-lg">{error}</p>}

          <button
            type="submit"
            disabled={loading || !name.trim() || !sector.trim()}
            className="w-full bg-brand-red text-white py-3 px-4 rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Création..." : "Continuer →"}
          </button>
        </form>
      </div>
    </div>
  );
}
