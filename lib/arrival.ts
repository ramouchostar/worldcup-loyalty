import { createAdminClient } from "./supabase";

// ============================================================
// Écran d'arrivée en un seul bouton (ADR 0097) — réservé aux arrivées par le QR imprimé.
//
// Qui quitte quoi : quelqu'un qui scanne l'affiche au comptoir a son ticket en main, un seul
// bouton suffit. Les autres arrivées (lien partagé, réseaux, robots) gardent la vitrine complète,
// qui explique le programme. Un membre connecté n'est pas concerné (il est déjà envoyé à son
// tableau de bord ou à « Continuer »).
//
// Drapeau PAR établissement, éteint par défaut : `restaurants.arrival_one_button`. Colonne absente
// (migration pas passée) ou panne → éteint : la vitrine habituelle, aucun risque.
// ============================================================

export function showOneButtonArrival(input: {
  flagOn: boolean;
  utmSource: string | null | undefined;
  isLoggedIn: boolean;
}): boolean {
  return input.flagOn && !input.isLoggedIn && (input.utmSource ?? "").trim().toLowerCase() === "qr_code";
}

export async function getArrivalOneButton(restaurantId: string): Promise<boolean> {
  try {
    const { data, error } = await createAdminClient()
      .from("restaurants")
      .select("arrival_one_button")
      .eq("id", restaurantId)
      .maybeSingle();
    if (error) return false;
    return (data as { arrival_one_button?: boolean } | null)?.arrival_one_button === true;
  } catch {
    return false;
  }
}

/** La ligne d'offre sous le bouton : le cadeau d'accueil s'il existe, sinon « des points », sinon rien. */
export function arrivalOfferLine(offer: { welcome: { name: string } | null; showcaseCount: number }): string | null {
  if (offer.welcome) return `${offer.welcome.name} offert pour ton premier ticket`;
  if (offer.showcaseCount > 0) return "Des points à chaque ticket";
  return null;
}
