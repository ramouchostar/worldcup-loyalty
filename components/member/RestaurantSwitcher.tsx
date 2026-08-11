"use client";

import { useState } from "react";
import Link from "next/link";

export type SwitcherRestaurant = { id: string; name: string };

// ADR 0015 §1-2 — un membre peut appartenir à plusieurs établissements ;
// ce sélecteur remplace le logo/nom fixe de l'ancien header mono-restaurant.
export function RestaurantSwitcher({
  current,
  restaurants,
}: {
  current: SwitcherRestaurant;
  restaurants: SwitcherRestaurant[];
}) {
  const [open, setOpen] = useState(false);
  const others = restaurants.filter((r) => r.id !== current.id);

  // Cas ultra-majoritaire : un seul établissement — pas de chevron ni de
  // dropdown, juste le nom (audit UX 2026-08-11 : affordance parasite).
  if (restaurants.length <= 1) {
    return (
      <span className="flex items-center gap-1.5 font-bold text-lg tracking-tight">
        🍗 <span className="text-brand-gold">{current.name}</span>
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 font-bold text-lg tracking-tight"
        aria-expanded={open}
        aria-haspopup="true"
      >
        🍗 <span className="text-brand-gold">{current.name}</span>
        <span className="text-xs text-gray-400">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute left-0 top-full mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-20 text-gray-900">
            {others.length > 0 && (
              <div className="px-3 pb-1.5 pt-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Mes établissements
              </div>
            )}
            {others.map((r) => (
              <Link
                key={r.id}
                href={`/r/${r.id}/dashboard`}
                className="block px-3 py-3 text-sm hover:bg-gray-50"
                onClick={() => setOpen(false)}
              >
                {r.name}
              </Link>
            ))}
            <Link
              href="/join"
              className="block px-3 py-3 text-sm font-semibold text-brand-red hover:bg-red-50 border-t border-gray-100 mt-1"
              onClick={() => setOpen(false)}
            >
              + Rejoindre un autre restaurant
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
