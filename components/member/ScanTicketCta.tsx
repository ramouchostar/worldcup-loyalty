"use client";
import Link from "next/link";
import { Camera } from "lucide-react";

// CTA de la vitrine → écran ticket, qui s'ouvre directement sur la caméra
// intégrée (ADR 0057). Même nombre de gestes qu'avant : un tap, la caméra.
//
// Ce bouton portait lui-même l'appareil photo du téléphone (<input capture>,
// audit parcours 2026-09-04). Sur Android, cet appareil photo met la page en
// arrière-plan et le système la tue : la photo n'arrivait jamais (ADR 0056).
export function ScanTicketCta({ restaurantId }: { restaurantId: string }) {
  return (
    <Link
      href={`/r/${restaurantId}/submit-order`}
      className="flex items-center justify-center gap-2 w-full bg-brand-red text-white text-center py-5 rounded-full font-bold text-xl hover:bg-brand-red/85 transition-colors shadow-lg mb-6"
    >
      Prendre mon ticket en photo <Camera className="w-6 h-6" strokeWidth={2.5} />
    </Link>
  );
}
