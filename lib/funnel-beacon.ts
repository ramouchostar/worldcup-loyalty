// Côté navigateur de l'entonnoir serveur (ADR 0037).
//
// Module séparé de `lib/funnel.ts` à dessein : celui-ci est importé par des
// composants client, et `lib/funnel.ts` embarque la clé service-role.
//
// `navigator.sendBeacon` d'abord, et ce n'est pas un détail de confort :
// `signup_started` est suivi dans la milliseconde d'une navigation complète
// (redirection OAuth), qui annulerait un `fetch` ordinaire. Une balise
// perdue, c'est un étage de l'entonnoir qui paraît vide.

/** Les seules étapes qu'un navigateur peut déclarer — miroir de CLIENT_REPORTABLE_STEPS. */
export type ClientFunnelStep = "ticket_capture_opened" | "signup_started" | "install_prompt_shown";

export function beaconFunnelStep(restaurantId: string, step: ClientFunnelStep): void {
  if (!restaurantId) return;
  const body = JSON.stringify({ restaurantId, step });
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const sent = navigator.sendBeacon("/api/funnel", new Blob([body], { type: "application/json" }));
      if (sent) return;
    }
    // Repli : `keepalive` demande au navigateur de laisser partir la requête
    // même si la page se démonte juste après.
    void fetch("/api/funnel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Best-effort de bout en bout : une mesure ne casse jamais un parcours.
  }
}
