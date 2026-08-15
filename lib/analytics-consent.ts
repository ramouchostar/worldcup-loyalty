// Consentement cookies analytics — stockage et lecture.
//
// Volontairement découplé de la table `consents` (ADR 0025), pour une raison
// juridique : le consentement ePrivacy doit être recueilli **avant** toute
// écriture sur le terminal, donc avant l'inscription, donc pour un visiteur
// qui n'a pas de `user_id`. Un cookie est le seul support qui couvre ce cas.
//
// Le choix reste rattachable au membre plus tard si besoin (ajouter la
// finalité `analytics` à `consents` et rejouer ce cookie à la connexion) —
// mais ce n'est pas nécessaire pour être conforme aujourd'hui.

export const CONSENT_COOKIE = "boosteats_consent";

/**
 * Version de la politique cookies. L'incrémenter invalide tous les
 * consentements existants et fait réapparaître la bannière — c'est le
 * mécanisme de re-consentement exigé par l'ADR 0025 §4 en cas de changement
 * matériel (nouvel outil de mesure, nouvelle finalité).
 */
export const CONSENT_VERSION = 1;

/** 6 mois — durée de vie recommandée par l'APD/CNIL pour un choix cookies. */
export const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 182;

export type ConsentChoice = "granted" | "denied";

/** Valeur exacte stockée dans le cookie, ex. `1:granted`. */
export function serializeConsent(choice: ConsentChoice): string {
  return `${CONSENT_VERSION}:${choice}`;
}

/**
 * Lit le choix courant. Renvoie `null` si aucun choix n'a été exprimé **ou**
 * si le choix porte sur une version de politique périmée — dans les deux cas
 * la bannière doit être présentée.
 */
export function readConsent(): ConsentChoice | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${CONSENT_COOKIE}=([^;]*)`),
  );
  if (!match) return null;

  const [version, choice] = decodeURIComponent(match[1]).split(":");
  if (Number(version) !== CONSENT_VERSION) return null;
  return choice === "granted" || choice === "denied" ? choice : null;
}

/** Persiste le choix et le propage immédiatement au Consent Mode v2. */
export function persistConsent(choice: ConsentChoice): void {
  if (typeof document === "undefined") return;

  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    `${CONSENT_COOKIE}=${encodeURIComponent(serializeConsent(choice))}` +
    `; Max-Age=${CONSENT_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;

  window.gtag?.("consent", "update", {
    analytics_storage: choice === "granted" ? "granted" : "denied",
  });
}

/**
 * Événement interne qui rouvre la bannière — permet au membre de revenir sur
 * son choix depuis /privacy (droit au retrait, ADR 0025 §6).
 */
export const REOPEN_CONSENT_EVENT = "boosteats:cookie-preferences";

export function openCookiePreferences(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(REOPEN_CONSENT_EVENT));
}
