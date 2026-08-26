"use client";

import { useState, useTransition } from "react";
import { removeSeatFromConsole } from "./actions";
import { ADMIN_ROLE_LABELS, type AdminRole } from "@/lib/restaurant-admin-roles";

// ADR 0041 §10 — un clic suffit pour l'invitation (SeatInviteForm), mais le
// retrait est plus lourd de conséquences (surtout pour soi-même ou le
// dernier gérant) : confirmation navigateur avant l'appel serveur.
export function SeatRow({
  restaurantId,
  userId,
  label,
  role,
  canRemove,
}: {
  restaurantId: string;
  userId: string;
  label: string;
  role: AdminRole;
  canRemove: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRemove() {
    if (!confirm(`Retirer ${label} de l'accès console de cet établissement ?`)) return;
    setError(null);
    startTransition(async () => {
      const res = await removeSeatFromConsole(restaurantId, userId);
      if (res.error) setError(res.error);
    });
  }

  return (
    <li className="border border-gray-100 rounded-xl px-3 py-2 space-y-1">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-gray-900 truncate">{label}</span>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
            {ADMIN_ROLE_LABELS[role]}
          </span>
          {canRemove && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={pending}
              className="text-xs text-red-600 hover:underline disabled:opacity-50"
            >
              {pending ? "..." : "Retirer"}
            </button>
          )}
        </div>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </li>
  );
}
