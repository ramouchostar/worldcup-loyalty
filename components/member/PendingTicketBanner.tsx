"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadPendingTicket } from "@/lib/pending-ticket";

// Audit parcours ticket (2026-09-04, friction M1) — une photo de ticket dort
// en IndexedDB (24 h, lib/pending-ticket) mais la vitrine n'en disait rien :
// la personne revenue plus tard repartait de zéro ou abandonnait. Ce bandeau
// la ramène sur l'écran de scan avec `?resume=1`, qui recharge la photo et
// enchaîne l'analyse (visiteur comme membre). Il ne rend RIEN tant qu'aucune
// photo fraîche n'existe — zéro bruit pour tous les autres.
export function PendingTicketBanner({ restaurantId }: { restaurantId: string }) {
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const file = await loadPendingTicket(restaurantId);
      if (file && !cancelled) setWaiting(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  if (!waiting) return null;

  return (
    <Link
      href={`/r/${restaurantId}/submit-order?resume=1`}
      className="flex items-center gap-3 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 mb-4 hover:bg-amber-100 transition-colors"
    >
      <span className="text-2xl shrink-0" aria-hidden="true">📸</span>
      <span className="flex-1 min-w-0">
        <span className="block font-bold text-amber-900 text-sm">Ton ticket t&apos;attend</span>
        <span className="block text-xs text-amber-800">Ta photo est encore là — envoie-la avant qu&apos;elle expire.</span>
      </span>
      <span className="text-amber-900 text-sm font-bold shrink-0">Reprendre →</span>
    </Link>
  );
}
