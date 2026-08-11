"use client";

import Link from "next/link";
import { useRestaurantInfo } from "@/components/member/RestaurantContext";

export function UserNav({
  email,
  isSuperAdmin = false,
  adminHref = null,
}: {
  email: string;
  isSuperAdmin?: boolean;
  adminHref?: string | null;
}) {
  // UserNav n'est rendu que par le layout membre, sous RestaurantProvider —
  // le restaurantId vient du contexte, sans nouvelle prop dans le layout.
  const { id: restaurantId } = useRestaurantInfo();
  return (
    <div className="flex items-center gap-3">
      {/* Porte d'entrée de la console plateforme (audit 2026-07-23 — page
          auparavant orpheline). Visible uniquement pour le super-admin. */}
      {isSuperAdmin && (
        <Link
          href="/platform"
          className="inline-flex items-center text-sm text-brand-gold hover:text-white px-3 py-2.5 min-h-[40px] rounded hover:bg-white/10 transition-colors"
        >
          🛠️ Plateforme
        </Link>
      )}
      {/* Pont membre → admin (ADR 0030 §2) — un restaurateur retrouve sa
          console sans connaître l'URL. */}
      {adminHref && (
        <Link
          href={adminHref}
          className="inline-flex items-center text-sm text-brand-gold hover:text-white px-3 py-2.5 min-h-[40px] rounded hover:bg-white/10 transition-colors"
        >
          🍽️ Ma console
        </Link>
      )}
      {/* Accès compte / confidentialité (RGPD, ADR 0025) — la BottomNav est
          limitée à 5 onglets, le compte vit donc dans l'en-tête. */}
      <Link
        href={`/r/${restaurantId}/compte`}
        className="inline-flex items-center text-sm text-gray-300 hover:text-white px-3 py-2.5 min-h-[40px] rounded hover:bg-white/10 transition-colors"
        aria-label="Mon compte et confidentialité"
      >
        ⚙️ Compte
      </Link>
      <span className="text-xs text-gray-400 max-w-[120px] truncate hidden sm:block">
        {email}
      </span>
      {/* « Sortir » plutôt que « Se déconnecter » : le header porte aussi le
          nom du restaurant (+ jusqu'à 2 liens admin) — le libellé long déborde
          sur petit écran (audit UX 2026-08-11, vocabulaire « Déco »). */}
      <form action="/api/auth/logout" method="POST">
        <button
          type="submit"
          className="inline-flex items-center text-sm text-gray-400 hover:text-white px-3 py-2.5 min-h-[40px] rounded hover:bg-white/10 transition-colors"
        >
          Sortir
        </button>
      </form>
    </div>
  );
}
