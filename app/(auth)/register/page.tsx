"use client";

import { useState } from "react";
import { registerProfile } from "./actions";
import { sanitizeZones } from "@/lib/zones";

function ageFrom(dateStr: string): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

const inputCls =
  "w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red text-gray-900";

export default function RegisterPage() {
  const [displayName, setDisplayName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [zoneHome, setZoneHome] = useState("");
  const [zoneWork, setZoneWork] = useState("");
  const [zoneSchool, setZoneSchool] = useState("");
  const [acceptPolicy, setAcceptPolicy] = useState(false);
  const [optMarketing, setOptMarketing] = useState(false);
  const [optInsights, setOptInsights] = useState(false);
  const [parentalEmail, setParentalEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const age = ageFrom(birthDate);
  const isMinor = age !== null && age < 13;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) { setError("Entre ton prénom."); return; }
    if (age === null || age < 0 || age > 120) { setError("Indique une date de naissance valide."); return; }
    const zones = sanitizeZones([zoneHome, zoneWork, zoneSchool]);
    if (zones.length === 0) { setError("Indique au moins ta zone (ville ou quartier où tu vis)."); return; }
    if (!acceptPolicy) { setError("Tu dois accepter la politique de confidentialité et les conditions d'utilisation."); return; }
    if (isMinor && !parentalEmail.trim()) { setError("Un email d'un parent est requis pour les moins de 13 ans."); return; }

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.set("display_name", displayName.trim());
    formData.set("birth_date", birthDate);
    zones.forEach((z) => formData.append("zones", z));
    formData.set("accept_policy", acceptPolicy ? "1" : "0");
    formData.set("opt_marketing", optMarketing ? "1" : "0");
    formData.set("opt_insights", optInsights ? "1" : "0");
    if (isMinor) formData.set("parental_email", parentalEmail.trim());

    const result = await registerProfile(null, formData);
    if (result?.error) { setError(result.error); setLoading(false); }
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
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Ex: Karim" required className={inputCls} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date de naissance</label>
          <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} required className={inputCls} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ta zone (ville ou quartier)</label>
          <input type="text" value={zoneHome} onChange={(e) => setZoneHome(e.target.value)} placeholder="Ex : Molenbeek" required maxLength={40} className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Zone de travail <span className="text-gray-400 font-normal">(facultatif)</span>
            </label>
            <input type="text" value={zoneWork} onChange={(e) => setZoneWork(e.target.value)} placeholder="Ex : Anderlecht" maxLength={40} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Zone d&apos;école <span className="text-gray-400 font-normal">(facultatif)</span>
            </label>
            <input type="text" value={zoneSchool} onChange={(e) => setZoneSchool(e.target.value)} placeholder="Ex : Ixelles" maxLength={40} className={inputCls} />
          </div>
        </div>

        {isMinor && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
            <p className="text-xs text-amber-800">
              Tu as moins de 13 ans : l&apos;accord d&apos;un parent est nécessaire. Indique son email — il recevra une demande de confirmation.
            </p>
            <input type="email" value={parentalEmail} onChange={(e) => setParentalEmail(e.target.value)} placeholder="Email d'un parent" className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm" />
          </div>
        )}

        {/* ADR 0022 — consentements (acceptation obligatoire, opt-ins séparés) */}
        <div className="space-y-2.5 border-t border-gray-100 pt-4">
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={acceptPolicy} onChange={(e) => setAcceptPolicy(e.target.checked)} className="mt-0.5" />
            <span>
              J&apos;ai lu et j&apos;accepte la{" "}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-brand-red underline">politique de confidentialité</a>{" "}
              et les{" "}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-brand-red underline">conditions d&apos;utilisation</a>.
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={optMarketing} onChange={(e) => setOptMarketing(e.target.checked)} className="mt-0.5" />
            <span>Recevoir les offres de mes restaurants. <span className="text-gray-400">Facultatif.</span></span>
          </label>
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={optInsights} onChange={(e) => setOptInsights(e.target.checked)} className="mt-0.5" />
            <span>Autoriser l&apos;usage de mes données anonymisées pour des statistiques. <span className="text-gray-400">Facultatif.</span></span>
          </label>
        </div>

        {error && <p className="text-red-600 text-sm bg-red-50 px-4 py-3 rounded-lg">{error}</p>}

        <button
          type="submit"
          disabled={loading || !displayName.trim() || !acceptPolicy}
          className="w-full bg-brand-red text-white py-3 px-4 rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Création..." : "Continuer"}
        </button>
      </form>

      {/* Sortie in-app : la complétion de profil est post-auth ; sans issue,
          l'utilisateur qui hésite est piégé (audit UX 2026-07). */}
      <form action="/api/auth/logout" method="POST" className="mt-4 text-center">
        <button type="submit" className="text-xs text-gray-400 hover:text-gray-600 underline">
          Annuler et se déconnecter
        </button>
      </form>
    </>
  );
}
