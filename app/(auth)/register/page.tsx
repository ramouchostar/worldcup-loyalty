"use client";

import { useEffect, useState } from "react";
import { registerProfile } from "./actions";
import { sanitizeZones } from "@/lib/zones";
import { createClient } from "@/lib/supabase-browser";
import { FieldError } from "@/components/FieldError";

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

function birthDateError(dateStr: string): string | null {
  const age = ageFrom(dateStr);
  if (age === null || age < 0 || age > 120) return "Indique une date de naissance valide.";
  return null;
}

const inputCls =
  "w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-red text-gray-900";

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
  // Erreurs par champ (audit UX sprint 2 §12) — prénom au submit, date de
  // naissance au blur + submit ; effacées à la re-saisie.
  const [fieldErrors, setFieldErrors] = useState<{ displayName?: string; birthDate?: string }>({});

  // WCAG 3.3.7 « Dites-le-nous une fois » (audit UX sprint 2 §9) : ne jamais
  // présenter un champ vide pour une donnée que l'app connaît déjà.
  // - métadonnées auth : given_name / name (Google), display_name (comptes legacy)
  // - profil en base : display_name, birth_date, zones (cas retour en arrière)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data } = await supabase
        .from("profiles")
        .select("display_name, birth_date, zones")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const profile = data as {
        display_name: string | null;
        birth_date: string | null;
        zones: string[] | null;
      } | null;

      const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
      const metaStr = (key: string) =>
        typeof meta[key] === "string" ? (meta[key] as string).trim() : "";
      // handle_new_user (m29b) pose un display_name provisoire = partie de
      // l'email avant le @ quand aucune métadonnée n'existe — on ne le
      // propose pas comme prénom.
      const emailPrefix = (user.email ?? "").split("@")[0];
      const storedName =
        profile?.display_name && profile.display_name !== emailPrefix
          ? profile.display_name
          : "";
      const metaName = metaStr("given_name") || metaStr("name") || metaStr("display_name");

      setDisplayName((v) => v || storedName || metaName);
      const storedBirth = profile?.birth_date ?? "";
      if (storedBirth) setBirthDate((v) => v || storedBirth);
      const zones: string[] = profile?.zones ?? [];
      if (zones[0]) setZoneHome((v) => v || zones[0]);
      if (zones[1]) setZoneWork((v) => v || zones[1]);
      if (zones[2]) setZoneSchool((v) => v || zones[2]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const age = ageFrom(birthDate);
  const isMinor = age !== null && age < 13;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nameErr = !displayName.trim() ? "Entre ton prénom." : null;
    const birthErr = birthDateError(birthDate);
    if (nameErr || birthErr) {
      setFieldErrors({ displayName: nameErr ?? undefined, birthDate: birthErr ?? undefined });
      return;
    }
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
      {/* Accueille les inscrits email comme les inscrits Google (audit UX sprint 2 §9) */}
      <p className="text-gray-500 text-sm mb-6">
        Encore 30 secondes : dis-nous qui tu es. On te proposera ensuite les équipes actives dans tes zones.
      </p>

      {/* noValidate : les erreurs sont affichées par champ (FieldError), pas
          par les bulles natives du navigateur */}
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <div>
          <label htmlFor="register-display-name" className="block text-sm font-medium text-gray-700 mb-1">Ton prénom</label>
          <input
            id="register-display-name"
            type="text"
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              setFieldErrors((prev) => (prev.displayName ? { ...prev, displayName: undefined } : prev));
            }}
            placeholder="Ex: Karim"
            required
            autoComplete="given-name"
            aria-invalid={fieldErrors.displayName ? true : undefined}
            aria-describedby={fieldErrors.displayName ? "register-display-name-error" : undefined}
            className={`${inputCls} ${fieldErrors.displayName ? "border-red-500" : "border-gray-300"}`}
          />
          <FieldError id="register-display-name-error" message={fieldErrors.displayName} />
        </div>

        <div>
          <label htmlFor="register-birth-date" className="block text-sm font-medium text-gray-700 mb-1">Date de naissance</label>
          <input
            id="register-birth-date"
            type="date"
            value={birthDate}
            onChange={(e) => {
              setBirthDate(e.target.value);
              setFieldErrors((prev) => (prev.birthDate ? { ...prev, birthDate: undefined } : prev));
            }}
            onBlur={() => {
              // Validation au blur uniquement si une valeur a été saisie
              if (!birthDate) return;
              setFieldErrors((prev) => ({ ...prev, birthDate: birthDateError(birthDate) ?? undefined }));
            }}
            required
            autoComplete="bday"
            aria-invalid={fieldErrors.birthDate ? true : undefined}
            aria-describedby={fieldErrors.birthDate ? "register-birth-date-error" : undefined}
            className={`${inputCls} ${fieldErrors.birthDate ? "border-red-500" : "border-gray-300"}`}
          />
          <FieldError id="register-birth-date-error" message={fieldErrors.birthDate} />
        </div>

        <div>
          <label htmlFor="register-zone-home" className="block text-sm font-medium text-gray-700 mb-1">Ta zone (ville ou quartier)</label>
          <input id="register-zone-home" type="text" value={zoneHome} onChange={(e) => setZoneHome(e.target.value)} placeholder="Ex : Molenbeek" required maxLength={40} className={`${inputCls} border-gray-300`} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="register-zone-work" className="block text-sm font-medium text-gray-700 mb-1">
              Zone de travail <span className="text-gray-400 font-normal">(facultatif)</span>
            </label>
            <input id="register-zone-work" type="text" value={zoneWork} onChange={(e) => setZoneWork(e.target.value)} placeholder="Ex : Anderlecht" maxLength={40} className={`${inputCls} border-gray-300`} />
          </div>
          <div>
            <label htmlFor="register-zone-school" className="block text-sm font-medium text-gray-700 mb-1">
              Zone d&apos;école <span className="text-gray-400 font-normal">(facultatif)</span>
            </label>
            <input id="register-zone-school" type="text" value={zoneSchool} onChange={(e) => setZoneSchool(e.target.value)} placeholder="Ex : Ixelles" maxLength={40} className={`${inputCls} border-gray-300`} />
          </div>
        </div>

        {isMinor && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
            <p className="text-xs text-amber-800">
              Tu as moins de 13 ans : l&apos;accord d&apos;un parent est nécessaire. Indique son email — il recevra une demande de confirmation.
            </p>
            <label htmlFor="register-parental-email" className="block text-sm font-medium text-amber-900">
              Email d&apos;un parent
            </label>
            <input id="register-parental-email" type="email" value={parentalEmail} onChange={(e) => setParentalEmail(e.target.value)} placeholder="parent@exemple.com" autoComplete="email" className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm" />
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

        {/* Le bouton reste désactivé tant que la case n'est pas cochée : on
            explique pourquoi au lieu de laisser un bouton mort (audit UX 2026-08). */}
        {!acceptPolicy && (
          <p className="text-sm text-gray-600 text-center">
            Coche la case ci-dessus pour continuer.
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !displayName.trim() || !acceptPolicy}
          className="w-full bg-brand-red text-white py-3 px-4 rounded-lg font-semibold hover:bg-brand-red/85 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Création..." : "Découvrir mon restaurant →"}
        </button>
      </form>

      {/* Sortie in-app : la complétion de profil est post-auth ; sans issue,
          l'utilisateur qui hésite est piégé (audit UX 2026-07). */}
      <form action="/api/auth/logout" method="POST" className="mt-4 text-center">
        <button type="submit" className="text-sm text-gray-600 hover:text-gray-800 underline inline-flex min-h-[44px] items-center">
          Annuler et se déconnecter
        </button>
      </form>
    </>
  );
}
