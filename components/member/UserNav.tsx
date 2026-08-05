"use client";

import Link from "next/link";

export function UserNav({
  email,
  isSuperAdmin = false,
  adminHref = null,
}: {
  email: string;
  isSuperAdmin?: boolean;
  adminHref?: string | null;
}) {
  return (
    <div className="flex items-center gap-2">
      {/* Porte d'entrée de la console plateforme (audit 2026-07-23 — page
          auparavant orpheline). Visible uniquement pour le super-admin. */}
      {isSuperAdmin && (
        <Link
          href="/platform"
          className="text-xs text-brand-gold hover:text-white px-2 py-1 rounded hover:bg-white/10 transition-colors"
        >
          🛠️ Plateforme
        </Link>
      )}
      {/* Pont membre → admin (ADR 0030 §2) — un restaurateur retrouve sa
          console sans connaître l'URL. */}
      {adminHref && (
        <Link
          href={adminHref}
          className="text-xs text-brand-gold hover:text-white px-2 py-1 rounded hover:bg-white/10 transition-colors"
        >
          🍽️ Ma console
        </Link>
      )}
      {/* Accès compte / confidentialité (RGPD, ADR 0025) — la BottomNav est
          limitée à 5 onglets, le compte vit donc dans l'en-tête. */}
      <Link
        href="/compte"
        className="text-xs text-gray-300 hover:text-white px-2 py-1 rounded hover:bg-white/10 transition-colors"
        aria-label="Mon compte et confidentialité"
      >
        ⚙️ Compte
      </Link>
      <span className="text-xs text-gray-400 max-w-[120px] truncate hidden sm:block">
        {email}
      </span>
      <form action="/api/auth/logout" method="POST">
        <button
          type="submit"
          className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-white/10 transition-colors"
        >
          Déco
        </button>
      </form>
    </div>
  );
}
