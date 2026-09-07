"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Scan } from "lucide-react";
import { savePendingTicket } from "@/lib/pending-ticket";

// Capture en un tap depuis la vitrine (audit parcours ticket, 2026-09-04) :
// le CTA porte directement l'appareil photo (<input capture>) au lieu de
// naviguer vers l'écran de scan d'abord — un tap et un chargement de page de
// moins sur LE geste du parcours. La photo brute part dans le stockage de
// reprise (lib/pending-ticket) et `?resume=1` la recharge sur l'écran de
// scan, qui la prépare et l'analyse comme d'habitude — même chemin visiteur
// que le bandeau « ton ticket t'attend » (PR #152).
// IndexedDB indisponible (navigation privée…) → repli : navigation simple,
// la personne reprend sa photo sur l'écran de scan, comme avant.
export function ScanTicketCta({ restaurantId }: { restaurantId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    await savePendingTicket(restaurantId, file);
    // Photo en poche (ou pas — repli identique) : l'écran de scan tranche.
    router.push(`/r/${restaurantId}/submit-order?resume=1`);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="flex items-center justify-center gap-2 w-full bg-brand-red text-white text-center py-5 rounded-full font-bold text-xl hover:bg-brand-red/85 disabled:opacity-70 transition-colors shadow-lg mb-6"
      >
        {busy ? "Une seconde…" : "Scanner mon ticket"} <Scan className="w-6 h-6" strokeWidth={2.5} />
      </button>
      {/* capture="environment" = caméra arrière directe sur mobile ; sur
          desktop, le sélecteur de fichiers s'ouvre — même repli qu'à l'écran
          de scan. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />
    </>
  );
}
