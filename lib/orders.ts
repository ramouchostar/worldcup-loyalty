export function buildDuplicateKey(date: string, time: string, amount: number): string {
  const timeHHMM = time.substring(0, 5);
  return `${date}_${timeHHMM}_${amount.toFixed(2)}`;
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
