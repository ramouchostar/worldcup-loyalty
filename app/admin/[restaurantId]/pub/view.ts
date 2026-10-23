import type { BadgeTone } from "@/components/admin/ui";
import type { RequestView } from "@/lib/ads/requests";

// Libellés partagés des écrans Pub de la console.

export const STATUS_VIEW: Record<RequestView["status"], { label: string; tone: BadgeTone; solid?: boolean }> = {
  paiement_attendu: { label: "Virement attendu", tone: "warn" },
  payee: { label: "Payée — en préparation", tone: "neutral" },
  preparee: { label: "En vérification", tone: "neutral" },
  a_corriger: { label: "À retoucher", tone: "warn" },
  en_diffusion: { label: "En diffusion", tone: "good", solid: true },
  en_pause: { label: "En pause", tone: "neutral" },
  terminee: { label: "Terminée", tone: "neutral" },
  annulee: { label: "Annulée", tone: "neutral" },
};

export const fr = (n: number) => n.toLocaleString("fr-BE");
export const dateFr = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-BE", { day: "numeric", month: "short", timeZone: "UTC" }) : "—");

