"use client";

import { useState } from "react";
import { acceptProgramme } from "./actions";
import { queueEvent } from "@/lib/analytics-pending";

// ADR 0047 — /register ne redemande PLUS rien (avant : prénom, naissance,
// zones… déjà demandés à l'inscription = tout en double). Il ne reste que le
// consentement, et uniquement pour ceux qui ne l'ont pas encore donné —
// typiquement l'arrivée Google OAuth, où aucune case n'a pu être cochée.
// Prénom, zones et date de naissance vivent dans /compte, au moment où ils
// servent.
export default function RegisterPage() {
  const [acceptPolicy, setAcceptPolicy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!acceptPolicy) {
      setError("Coche la case de consentement pour continuer.");
      return;
    }
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.set("accept_policy", "1");

    // L'action redirige côté serveur en cas de succès — l'événement passe
    // par la file (lib/analytics-pending.ts).
    queueEvent("member_profile_completed", { zones_count: 0, is_minor: false });

    const result = await acceptProgramme(null, formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <>
      <h2 className="text-xl font-bold text-gray-900 mb-1">Dernière étape</h2>
      <p className="text-gray-500 text-sm mb-6">
        Ton compte est prêt — il ne manque que ton accord. Tu compléteras ton
        profil plus tard, si tu veux.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* ADR 0022 — acceptation obligatoire ; opt-ins facultatifs dans Mon compte */}
        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={acceptPolicy}
            onChange={(e) => setAcceptPolicy(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            J&apos;accepte la{" "}
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-brand-red underline">politique de confidentialité</a>{" "}
            et les{" "}
            <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-brand-red underline">conditions d&apos;utilisation</a>,
            et je confirme avoir au moins 13 ans (ou l&apos;accord d&apos;un parent).
          </span>
        </label>

        {error && <p className="text-red-600 text-sm bg-red-50 px-4 py-3 rounded-lg">{error}</p>}

        <button
          type="submit"
          disabled={loading || !acceptPolicy}
          className="w-full bg-brand-red text-white py-3 px-4 rounded-lg font-semibold hover:bg-brand-red/85 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Un instant..." : "C'est parti 🎉"}
        </button>
      </form>

      {/* Sortie in-app : sans issue, l'utilisateur qui hésite est piégé
          (audit UX 2026-07). */}
      <form action="/api/auth/logout" method="POST" className="mt-4 text-center">
        <button type="submit" className="text-xs text-gray-400 hover:text-gray-600 underline">
          Annuler et se déconnecter
        </button>
      </form>
    </>
  );
}
