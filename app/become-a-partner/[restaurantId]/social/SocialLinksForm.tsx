"use client";

import { useState } from "react";
import { submitOnboardingSocial } from "../../actions";
import { queueEvent } from "@/lib/analytics-pending";

// Dernière étape : `partner_onboarding_completed` marque la fin du tunnel, y
// compris quand le restaurateur passe les réseaux sociaux — l'étape est
// facultative, le tunnel est bien terminé dans les deux cas.
function queueFinalStep() {
  queueEvent("partner_step_completed", { step_name: "social", step_number: 4 });
  queueEvent("partner_onboarding_completed", { steps_total: 4 });
}

type Initial = {
  google_maps_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  facebook_url: string | null;
};

export function SocialLinksForm({ restaurantId, initial }: { restaurantId: string; initial: Initial }) {
  const [googleMapsUrl, setGoogleMapsUrl] = useState(initial.google_maps_url ?? "");
  const [instagramUrl, setInstagramUrl] = useState(initial.instagram_url ?? "");
  const [tiktokUrl, setTiktokUrl] = useState(initial.tiktok_url ?? "");
  const [facebookUrl, setFacebookUrl] = useState(initial.facebook_url ?? "");
  const [showHelp, setShowHelp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.set("google_maps_url", googleMapsUrl.trim());
    formData.set("instagram_url", instagramUrl.trim());
    formData.set("tiktok_url", tiktokUrl.trim());
    formData.set("facebook_url", facebookUrl.trim());

    queueFinalStep();
    const result = await submitOnboardingSocial(restaurantId, null, formData);
    // Si pas d'erreur, l'action redirige vers /admin/[restaurantId]/menu.
    if (result?.error) {
      setError(result.error);
      setSubmitting(false);
    }
  }

  async function handleSkip() {
    setSubmitting(true);
    setError(null);
    const formData = new FormData();
    formData.set("skip", "true");
    queueFinalStep();
    const result = await submitOnboardingSocial(restaurantId, null, formData);
    if (result?.error) {
      setError(result.error);
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl p-8 space-y-5">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700">Liens de tes pages</label>
          <button
            type="button"
            onClick={() => setShowHelp((v) => !v)}
            className="text-xs font-semibold text-brand-red hover:underline"
          >
            {showHelp ? "Masquer l'aide" : "Comment trouver mon lien ?"}
          </button>
        </div>
        {showHelp && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900 space-y-1">
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
            placeholder="Lien Google Maps (avis clients)"
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

        {error && <p className="text-red-600 text-sm bg-red-50 px-4 py-3 rounded-lg">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-brand-red text-white py-3 px-4 rounded-lg font-semibold hover:bg-brand-red/85 disabled:opacity-50 transition-colors"
        >
          {submitting ? "Enregistrement..." : "Terminer l'inscription →"}
        </button>
      </form>

      {/* Sortie explicite — toujours disponible, reconfigurable plus tard */}
      <div className="text-center">
        <button
          type="button"
          onClick={handleSkip}
          disabled={submitting}
          className="text-sm text-gray-400 underline hover:text-gray-600 disabled:opacity-50"
        >
          Je verrai ça plus tard — terminer l&apos;inscription sans
        </button>
      </div>
    </div>
  );
}
