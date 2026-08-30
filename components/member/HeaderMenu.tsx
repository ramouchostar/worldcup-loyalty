"use client";

import { useState } from "react";
import Link from "next/link";

export type SwitcherRestaurant = { id: string; name: string };

// Menu sandwich unique du header membre — remplace l'ancien duo
// RestaurantSwitcher (gauche) + UserNav (droite) : logo + nom centrés dans
// le header, tout le reste (établissements, console, compte, déco) regroupé
// ici derrière ☰ pour laisser le centre au branding.
export function HeaderMenu({
  email,
  isSuperAdmin = false,
  adminHref = null,
  current,
  restaurants,
}: {
  email: string;
  isSuperAdmin?: boolean;
  adminHref?: string | null;
  current: SwitcherRestaurant;
  restaurants: SwitcherRestaurant[];
}) {
  const [open, setOpen] = useState(false);
  const others = restaurants.filter((r) => r.id !== current.id);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-white/10 transition-colors text-xl leading-none"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Menu"
      >
        {open ? "✕" : "☰"}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-20 text-gray-900">
            {others.length > 0 && (
              <div className="px-3 pb-1.5 pt-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Mes établissements
              </div>
            )}
            {others.map((r) => (
              <Link
                key={r.id}
                href={`/r/${r.id}/dashboard`}
                className="block px-3 py-2 text-sm hover:bg-gray-50"
                onClick={() => setOpen(false)}
              >
                {r.name}
              </Link>
            ))}
            <Link
              href="/join"
              className="block px-3 py-2 text-sm font-semibold text-brand-red hover:bg-red-50 border-t border-gray-100"
              onClick={() => setOpen(false)}
            >
              + Rejoindre un autre restaurant
            </Link>

            <div className="border-t border-gray-100 mt-1 pt-1">
              {/* Porte d'entrée de la console plateforme (audit 2026-07-23) —
                  visible uniquement pour le super-admin. */}
              {isSuperAdmin && (
                <Link
                  href="/platform"
                  className="block px-3 py-2 text-sm hover:bg-gray-50"
                  onClick={() => setOpen(false)}
                >
                  🛠️ Plateforme
                </Link>
              )}
              {/* Pont membre → admin (ADR 0030 §2). */}
              {adminHref && (
                <Link
                  href={adminHref}
                  className="block px-3 py-2 text-sm hover:bg-gray-50"
                  onClick={() => setOpen(false)}
                >
                  🍽️ Ma console
                </Link>
              )}
              <Link
                href="/compte"
                className="block px-3 py-2 text-sm hover:bg-gray-50"
                onClick={() => setOpen(false)}
                aria-label="Mon compte et confidentialité"
              >
                ⚙️ Compte
              </Link>
            </div>

            <div className="border-t border-gray-100 mt-1 pt-2 px-3 flex items-center justify-between gap-2">
              <span className="text-xs text-gray-400 truncate">{email}</span>
              <form action="/api/auth/logout" method="POST">
                <button type="submit" className="text-xs font-semibold text-gray-500 hover:text-gray-900 shrink-0">
                  Déco
                </button>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
