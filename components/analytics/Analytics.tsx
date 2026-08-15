import Script from "next/script";
import { GoogleAnalytics } from "@next/third-parties/google";
import { GA_MEASUREMENT_ID, analyticsEnabled } from "@/lib/analytics";
import { CONSENT_COOKIE, CONSENT_VERSION } from "@/lib/analytics-consent";

// Socle GA4 — Consent Mode v2 en mode « avancé ».
//
// L'ordre d'exécution est la seule chose qui compte ici, et il est fragile :
//
//   1. `beforeInteractive` pose `dataLayer`, `gtag` et les valeurs de
//      consentement PAR DÉFAUT (tout refusé), dans le HTML initial ;
//   2. le choix déjà exprimé par le visiteur est rejoué depuis le cookie,
//      toujours avant le chargement de gtag.js ;
//   3. `<GoogleAnalytics>` charge gtag.js et exécute `config`.
//
// Si gtag.js se chargeait avant l'étape 1, il écrirait ses cookies pendant la
// fraction de seconde qui précède — ce qui est exactement l'infraction qu'on
// cherche à éviter. D'où `beforeInteractive` (script inline dans le <head>) et
// non `afterInteractive`.
//
// Mode « avancé » = gtag.js est chargé pour tout le monde, mais tant que le
// consentement est refusé il n'écrit aucun cookie et n'envoie que des pings
// sans identifiant, que GA4 utilise pour modéliser les conversions manquantes.
// L'alternative (« basique » : ne charger gtag.js qu'après acceptation) est
// plus conservatrice mais perd toute visibilité sur les visiteurs qui
// refusent. Bascule documentée dans docs/tracking-plan.md.
//
// `ad_storage` / `ad_user_data` / `ad_personalization` restent refusés en dur :
// la plateforme ne fait pas de publicité Google aujourd'hui, et un signal
// publicitaire qu'on ne consomme pas est un risque juridique gratuit. À
// rouvrir explicitement le jour où Google Ads est branché.

const consentBootstrap = `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = gtag;
gtag('consent', 'default', {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied',
  functionality_storage: 'granted',
  security_storage: 'granted',
  wait_for_update: 500
});
gtag('set', 'ads_data_redaction', true);
gtag('set', 'url_passthrough', true);
try {
  if (document.cookie.indexOf('${CONSENT_COOKIE}=${CONSENT_VERSION}%3Agranted') !== -1
   || document.cookie.indexOf('${CONSENT_COOKIE}=${CONSENT_VERSION}:granted') !== -1) {
    gtag('consent', 'update', { analytics_storage: 'granted' });
  }
} catch (e) {}
`;

export function Analytics() {
  // Pas d'ID de mesure (dev local, previews) → rien n'est injecté du tout.
  if (!analyticsEnabled) return null;

  return (
    <>
      <Script id="ga-consent-default" strategy="beforeInteractive">
        {consentBootstrap}
      </Script>
      <GoogleAnalytics gaId={GA_MEASUREMENT_ID} />
    </>
  );
}
