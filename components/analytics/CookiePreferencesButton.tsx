"use client";

import { analyticsEnabled } from "@/lib/analytics";
import { openCookiePreferences } from "@/lib/analytics-consent";

/**
 * Rouvre la bannière cookies pour revenir sur son choix.
 *
 * Le retrait du consentement doit être aussi accessible que son octroi
 * (ADR 0025 §6) : sans ce point d'entrée, un « Accepter » cliqué une fois
 * serait irréversible pendant six mois côté visiteur.
 */
export function CookiePreferencesButton() {
  if (!analyticsEnabled) return null;

  return (
    <button
      type="button"
      onClick={openCookiePreferences}
      className="text-xs text-gray-400 hover:text-gray-600 underline"
    >
      Gérer mes cookies
    </button>
  );
}
