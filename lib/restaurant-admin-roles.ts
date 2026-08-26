// ADR 0041 — rôles établissement : type, libellés, parsing. Extrait de
// lib/restaurant-admins.ts pour rester importable depuis un composant
// CLIENT (SeatInviteForm.tsx, SeatRow.tsx) sans entraîner createAdminClient
// (donc next/headers, invalide côté client) dans le bundle — un import
// depuis un module qui touche la DB embarque tous ses imports de tête,
// même pour un export qui ne l'utilise pas.

export type AdminRole = "gerant" | "manager" | "equipe";

export const ADMIN_ROLES: AdminRole[] = ["gerant", "manager", "equipe"];

// « équipe » nu ne doit JAMAIS apparaître seul dans une surface admin : c'est
// déjà le nom du groupe communautaire côté membre (table teams, capitaine).
// Toujours qualifié ici pour éviter la collision.
export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  gerant: "Gérant",
  manager: "Manager",
  equipe: "Équipe (accès établissement)",
};

function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === "string" && (ADMIN_ROLES as string[]).includes(value);
}

export function parseAdminRole(value: FormDataEntryValue | null, fallback: AdminRole = "gerant"): AdminRole {
  return isAdminRole(value) ? value : fallback;
}
