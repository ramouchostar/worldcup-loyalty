// ADR 0053 — l'état de chaque QR de l'équipe en salle, et qui relancer.
// Pur, date injectée, testé : la page QR, l'accueil de la console et les
// messages au restaurateur parlent de la même règle.
//
// « À relancer » = QR actif créé depuis plus de STAFF_NEW_DAYS jours ET scanné
// moins de STAFF_NUDGE_MIN_LANDINGS fois sur 30 jours. Avant 7 jours, la
// personne est « Nouveau » : on ne la met pas en défaut trop tôt. Le chiffre
// qui dira que la règle est fausse : des personnes « à relancer » qui font
// pourtant inscrire des clients (inscrits > 0 malgré peu d'arrivées
// comptées) — d'où `signups30d` dans la condition.

export const STAFF_NEW_DAYS = 7;
export const STAFF_NUDGE_MIN_LANDINGS = 3;

const DAY_MS = 86_400_000;

export type StaffStatus = "top" | "actif" | "nouveau" | "a_relancer" | "desactive";

export type StaffStatusInput = {
  label: string;
  isActive: boolean;
  landings30d: number;
  signups30d: number;
  createdAt: string | null;
};

export function isNewStaff(s: Pick<StaffStatusInput, "createdAt">, now: Date): boolean {
  if (!s.createdAt) return false;
  return now.getTime() - new Date(s.createdAt).getTime() < STAFF_NEW_DAYS * DAY_MS;
}

export function needsNudge(s: StaffStatusInput, now: Date): boolean {
  if (!s.isActive || !s.createdAt) return false;
  if (isNewStaff(s, now)) return false;
  return s.landings30d < STAFF_NUDGE_MIN_LANDINGS && s.signups30d === 0;
}

/** Le meilleur du mois : le plus d'inscrits sur 30 jours (au moins un). */
export function topStaff<T extends StaffStatusInput>(stats: T[]): T | null {
  let best: T | null = null;
  for (const s of stats) {
    if (!s.isActive || s.signups30d <= 0) continue;
    if (!best || s.signups30d > best.signups30d) best = s;
  }
  return best;
}

export function staffStatus<T extends StaffStatusInput>(s: T, all: T[], now: Date): StaffStatus {
  if (!s.isActive) return "desactive";
  if (topStaff(all) === s) return "top";
  if (needsNudge(s, now)) return "a_relancer";
  if (isNewStaff(s, now)) return "nouveau";
  return "actif";
}

export function staffToNudge<T extends StaffStatusInput>(stats: T[], now: Date): T[] {
  return stats.filter((s) => needsNudge(s, now));
}

/** Ordre d'affichage : actifs par inscrits puis arrivées, désactivés à part. */
export function sortStaff<T extends StaffStatusInput>(stats: T[]): T[] {
  return [...stats].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return b.signups30d - a.signups30d || b.landings30d - a.landings30d || a.label.localeCompare(b.label, "fr");
  });
}

/** « Karim », « Karim et Inès », « Karim, Inès et Sami ». */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} et ${names[names.length - 1]}`;
}

// ── Contenu du badge (validé par le porteur, 2026-09-10) ────────────────────
// Ici plutôt que dans staff-codes.ts (serveur) : la console le met dans le
// message WhatsApp qu'elle prépare côté navigateur.

export const STAFF_PITCH =
  "Vous connaissez notre programme de fidélité ? Vous photographiez votre ticket, vous gagnez des cadeaux — je vous montre, ça prend 20 secondes.";

export const STAFF_FAQ: { q: string; a: string }[] = [
  { q: "C'est payant ?", a: "Non — gratuit, pour toujours. Pas de carte à garder." },
  { q: "Je gagne quoi ?", a: "Des cadeaux du menu à mesure que vos tickets s'accumulent, à retirer au comptoir." },
  { q: "Et mes données ?", a: "Elles ne servent qu'au programme — jamais revendues, effaçables à tout moment." },
];

/** Message WhatsApp du gérant à une personne de l'équipe : son badge et la phrase. */
export function staffBadgeWhatsappUrl(label: string, restaurantName: string, badgeUrl: string): string {
  const text = `Salut ${label} ! Voici ton QR pour le programme de fidélité de ${restaurantName} : ${badgeUrl}\n\nMontre-le au client qui paie, avec la phrase : « ${STAFF_PITCH} »`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

// ── Mois civils à Bruxelles (bilan mensuel, ADR 0077) ─────────────────────

// Minuit à Bruxelles du 1er du mois (« AAAAMM ») en ISO UTC — été comme hiver.
export function brusselsMonthStartIso(yyyymm: number): string {
  const y = Math.floor(yyyymm / 100);
  const m = yyyymm % 100;
  const noon = new Date(Date.UTC(y, m - 1, 1, 12));
  const localHour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Brussels", hour: "2-digit", hourCycle: "h23" }).format(noon)
  );
  return new Date(Date.UTC(y, m - 1, 1) - (localHour - 12) * 3_600_000).toISOString();
}

export function nextMonth(yyyymm: number): number {
  const y = Math.floor(yyyymm / 100);
  const m = yyyymm % 100;
  return m === 12 ? (y + 1) * 100 + 1 : y * 100 + m + 1;
}

export function previousMonth(yyyymm: number): number {
  const y = Math.floor(yyyymm / 100);
  const m = yyyymm % 100;
  return m === 1 ? (y - 1) * 100 + 12 : y * 100 + m - 1;
}
