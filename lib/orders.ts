// Bestelnummer format: YYYY-MM-DD/NNN/NNNNN (ex: 2026-06-01/258/03993)
// Legacy (ADR 0019) : la validation de la clé de commande passe désormais
// par validateOrderKey(lib/receipt-config.ts), pilotée par la config de
// l'établissement. Conservé pour les outils qui valident du Bestelnummer pur.
export function validateOrderNumber(orderNumber: string): string | null {
  const regex = /^\d{4}-\d{2}-\d{2}\/\d{3}\/\d{5}$/;
  if (!regex.test(orderNumber.trim())) {
    return "Numéro de commande invalide. Le format attendu est YYYY-MM-DD/NNN/NNNNN (visible sur le ticket).";
  }
  return null;
}

export function validateOrderDate(dateStr: string): string | null {
  const programStart = process.env.NEXT_PUBLIC_PROGRAM_START_DATE ?? "2026-06-01";
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  if (isNaN(date.getTime())) return "Date invalide.";
  if (date > today) return "La date ne peut pas être dans le futur.";
  if (dateStr < programStart) return `Les commandes sont comptabilisées à partir du ${programStart}.`;
  return null;
}

export function validateAmount(amount: unknown): string | null {
  const n = Number(amount);
  if (isNaN(n) || n <= 0) return "Le montant doit être supérieur à 0€.";
  if (n > 500) return "Le montant ne peut pas dépasser 500€.";
  return null;
}
