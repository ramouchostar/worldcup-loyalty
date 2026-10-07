// ADR 0030 §1 (amendé) — « voir l'app comme un client ».
// Un compte qui a une console (restaurateur, super-admin) atterrit toujours
// dans la console : c'est voulu, mais l'app installée (start_url /membres)
// devenait alors une impasse dès que l'établissement n'était pas actif
// (en attente / désactivé : pas d'espace membre à montrer, pas de déconnexion).
// Le cookie ci-dessous mémorise le choix « je veux l'app côté client » ;
// /mode/restaurateur l'efface. Pur et sans réseau : partagé avec le middleware.

export const VIEW_MODE_COOKIE = "be_view_mode";
export const VIEW_MODE_MAX_AGE = 60 * 60 * 24 * 365;

export function isClientMode(value: string | null | undefined): boolean {
  return value === "client";
}

export type DestinationFacts = {
  isSuperAdmin: boolean;
  hasConsole: boolean;
  membershipRestaurantId: string | null;
  hasDisplayName: boolean;
};

// Même hiérarchie qu'avant : plateforme > console > membre ; `as=resto`
// (porte « Espace restaurateur ») force la console ; le mode client saute
// plateforme et console pour retomber sur l'espace membre (ou /join).
export function pickDestination(
  f: DestinationFacts,
  opts: { as?: string | null; clientMode?: boolean } = {}
): string {
  if (opts.as === "resto") {
    if (f.hasConsole) return "/admin";
    if (f.isSuperAdmin) return "/platform";
    return "/become-a-partner";
  }
  if (!opts.clientMode) {
    if (f.isSuperAdmin) return "/platform";
    if (f.hasConsole) return "/admin";
  }
  if (f.membershipRestaurantId) return `/r/${f.membershipRestaurantId}/dashboard`;
  return f.hasDisplayName ? "/join" : "/register";
}
