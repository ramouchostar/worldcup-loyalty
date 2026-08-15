"use client";

import { useState } from "react";
import { createOwnerInviteFromForm } from "./actions";

// ADR 0032 — génère le lien d'invitation restaurateur et le donne à partager tout
// de suite (copie / WhatsApp), sans quitter la console. L'email est facultatif :
// renseigné, le lien part aussi par email ; vide, on partage à la main.
export function InviteOwnerForm({
  restaurants,
}: {
  restaurants: { id: string; name: string; hasOwner: boolean }[];
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; emailed: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [restaurantId, setRestaurantId] = useState("");

  const selected = restaurants.find((r) => r.id === restaurantId);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    // Réassigner un établissement qui a déjà un restaurateur rattaché coupe l'accès du
    // précédent (owner_id est unique par resto) — on le dit avant.
    if (
      selected?.hasOwner &&
      !confirm(`« ${selected.name} » a déjà un restaurateur rattaché. Le nouveau lien le remplacera. Continuer ?`)
    ) {
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setCopied(false);

    const res = await createOwnerInviteFromForm(null, new FormData(form));
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (res.url) {
      setResult({ url: res.url, emailed: !!res.emailed });
      form.reset();
      setRestaurantId("");
    }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <select
            name="restaurant_id"
            required
            value={restaurantId}
            onChange={(e) => setRestaurantId(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="" disabled>
              Établissement…
            </option>
            {restaurants.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.hasOwner ? " (a déjà un restaurateur rattaché)" : ""}
              </option>
            ))}
          </select>
          <input
            name="owner_email"
            type="email"
            placeholder="Email (facultatif)"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand-red text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-red-700 disabled:opacity-50 transition-colors"
        >
          {loading ? "Génération..." : "Générer le lien d'invitation"}
        </button>
      </form>

      {result && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 space-y-2">
          <p className="text-sm font-semibold text-green-900">
            Lien prêt {result.emailed ? "— et envoyé par email." : "— à envoyer au restaurateur."}
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={result.url}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 border border-green-200 rounded-lg px-3 py-2 text-xs bg-white font-mono"
            />
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(result.url);
                setCopied(true);
              }}
              className="px-3 py-2 bg-white border border-green-200 rounded-lg text-sm font-medium hover:bg-green-100 shrink-0"
            >
              {copied ? "Copié ✓" : "Copier"}
            </button>
          </div>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(
              `Voici ton accès restaurateur Boosteats 👉 ${result.url}`
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center bg-[#25D366] text-white py-2 rounded-lg text-sm font-semibold hover:brightness-95 transition"
          >
            Envoyer par WhatsApp
          </a>
          <p className="text-xs text-green-700">
            Valable 14 jours, utilisable une seule fois. Le restaurateur peut créer son
            compte après avoir cliqué.
          </p>
        </div>
      )}
    </div>
  );
}
