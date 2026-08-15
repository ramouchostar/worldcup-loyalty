"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { analyticsEnabled, track } from "@/lib/analytics";
import {
  REOPEN_CONSENT_EVENT,
  persistConsent,
  readConsent,
  type ConsentChoice,
} from "@/lib/analytics-consent";

// Écrans où la bannière ne doit jamais s'interposer : le coupon de
// récupération (ADR 0011) se joue en 10 minutes chronométrées au comptoir, et
// la page hors-ligne n'a par définition rien à mesurer.
const SILENCED_PREFIXES = ["/coupon/", "/admin/coupon/", "/offline"];

export function CookieBanner() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  // Le cookie n'est lisible qu'après hydratation — d'où l'état initial fermé
  // plutôt qu'un `cookies()` côté serveur, qui rendrait dynamiques toutes les
  // pages statiques du site (/privacy, /terms) juste pour afficher un bandeau.
  useEffect(() => {
    if (!analyticsEnabled) return;
    if (readConsent() === null) setVisible(true);
  }, []);

  // Réouverture depuis « Gérer mes cookies » (/privacy) — le retrait du
  // consentement doit rester aussi simple que son octroi (ADR 0025 §6).
  useEffect(() => {
    const reopen = () => setVisible(true);
    window.addEventListener(REOPEN_CONSENT_EVENT, reopen);
    return () => window.removeEventListener(REOPEN_CONSENT_EVENT, reopen);
  }, []);

  const choose = useCallback(
    (choice: ConsentChoice) => {
      persistConsent(choice);
      setVisible(false);
      // Émis après `persistConsent` : le Consent Mode est déjà passé à
      // `granted`, l'événement est donc rattaché à une vraie session.
      if (choice === "granted") {
        track("cookie_consent_granted", { surface: pathname ?? "inconnu" });
      }
    },
    [pathname],
  );

  if (!visible) return null;
  if (pathname && SILENCED_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Choix des cookies"
      className="fixed inset-x-0 bottom-0 z-[100] p-3 sm:p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <div className="mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_8px_40px_rgba(0,0,0,0.18)] sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900">
              On mesure l&apos;audience de ce site
            </p>
            <p className="mt-1 text-sm leading-relaxed text-gray-600">
              Uniquement pour comprendre comment il est utilisé et l&apos;améliorer. Aucune
              publicité, aucune revente. Tu peux refuser sans rien perdre.{" "}
              <Link
                href="/privacy"
                className="font-medium text-gray-900 underline underline-offset-2 hover:text-black"
              >
                En savoir plus
              </Link>
            </p>
          </div>

          {/* Refuser et Accepter au même niveau, en un clic chacun : l'APD
              impose que le refus soit aussi simple que l'acceptation. */}
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => choose("denied")}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 sm:flex-none"
            >
              Refuser
            </button>
            <button
              type="button"
              onClick={() => choose("granted")}
              className="flex-1 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black sm:flex-none"
            >
              Accepter
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
