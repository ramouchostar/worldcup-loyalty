// ADR 0112 — ce que « Mes articles » et le réglage disent de la publication automatique. PUR, testé.

import { dayLabel } from "../view";
import { endLabel, sourceLine } from "./phrases";
import { reasonText } from "./reasons";
import type { OccasionSource } from "./sources/types";
import { addDays, brusselsDay, dayMonth, weekdayName } from "./time";
import { AUTO_KINDS, PENDING_STATUSES, type AutoKind, type Occasion } from "./types";

/** Les occasions pas parues qu'on montre encore : deux semaines en arrière, dix au plus. */
export const MISSED_DAYS = 14;
export const MISSED_MAX = 10;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** « Aujourd'hui », « Demain, samedi », « Dimanche 29 novembre ». */
export function dayWord(day: string, today: string): string {
  if (day === today) return "Aujourd'hui";
  if (day === addDays(today, 1)) return `Demain, ${weekdayName(day)}`;
  return `${cap(weekdayName(day))} ${dayMonth(day)}`;
}

export type UpcomingItem = {
  occasionId: string;
  /** `null` tant que le restaurant n'est pas prévenu : il n'y a pas encore d'article à lire. */
  postId: string | null;
  when: string;
  title: string;
  line: string;
};

export function upcomingItems(occasions: Occasion[], now: Date): UpcomingItem[] {
  const today = brusselsDay(now);
  return occasions
    .filter((o) => PENDING_STATUSES.includes(o.status) && o.publish_day >= today && Date.parse(o.expires_at) > now.getTime())
    .sort((a, b) => a.publish_day.localeCompare(b.publish_day))
    .map((o) => ({
      occasionId: o.id,
      postId: o.status === "prevenu" ? o.post_id : null,
      when: `${dayWord(o.publish_day, today)} à 10:00`,
      title: o.title,
      line:
        o.status === "prevenu"
          ? sourceLine(o.facts)
          : o.publish_day === today
            ? "Tu n'as pas été prévenu : il ne sera pas publié."
            : `Tu seras prévenu ${o.publish_day === addDays(today, 1) ? "aujourd'hui" : weekdayName(addDays(o.publish_day, -1))} à 17:00.`,
    }));
}

export type MissedItem = { id: string; label: string; reason: string };

export function missedItems(occasions: Occasion[], now: Date): MissedItem[] {
  const since = addDays(brusselsDay(now), -MISSED_DAYS);
  return occasions
    .filter((o) => (o.status === "refuse" || o.status === "ecarte") && o.publish_day >= since)
    .sort((a, b) => b.publish_day.localeCompare(a.publish_day) || b.updated_at.localeCompare(a.updated_at))
    .slice(0, MISSED_MAX)
    .map((o) => ({
      id: o.id,
      label: `${o.label} (${weekdayName(o.occasion_day)} ${dayMonth(o.occasion_day)})`,
      reason: reasonText(o.reason, o.reason_detail),
    }));
}

/** La phrase d'un article automatique publié : comment il est parti, et quand il se retire. */
export function publishedNote(occasion: Pick<Occasion, "published_mode" | "published_at" | "expires_at" | "occasion_day">, now: Date): string {
  const at = occasion.published_at;
  const today = brusselsDay(now);
  const day = at ? brusselsDay(at) : null;
  const when = day === today ? "aujourd'hui" : day === addDays(today, -1) ? "hier" : at ? `le ${dayLabel(at)}` : "";
  const how = occasion.published_mode === "auto" ? "Publié tout seul" : "Publié";
  const over = Date.parse(occasion.expires_at) <= now.getTime();
  const end = over ? "Retiré tout seul à la fin de l'occasion." : `Retiré tout seul ${endLabel(occasion.expires_at, occasion.occasion_day)}.`;
  return `${how}${when ? ` ${when}` : ""}. ${end}`;
}

export type KindChoice = { kind: AutoKind; available: boolean; note: string };

/** Les types dont la source peut donner quelque chose aujourd'hui. */
export async function readyKinds(sources: OccasionSource[]): Promise<Set<AutoKind>> {
  const states = await Promise.all(sources.map(async (s) => [s.kind, await s.unavailable()] as const));
  return new Set(states.filter(([, why]) => why === null).map(([kind]) => kind));
}

const NO_POSITION = "Pas encore possible : la position de ton restaurant manque.";

/** Les cases du réglage : ce qu'on peut cocher, et pourquoi le reste ne l'est pas, dit au restaurateur. */
export function kindChoices(ready: ReadonlySet<AutoKind>, hasPosition: boolean): KindChoice[] {
  return AUTO_KINDS.map((kind) => {
    const on = ready.has(kind);
    if (kind === "promo") return { kind, available: on, note: on ? "" : "Pas encore possible : les offres arrivent plus tard." };
    if (kind === "match") return { kind, available: on, note: on ? "Pro League, coupes d'Europe et grandes sélections, le soir." : "Pas encore possible." };
    if (kind === "meteo") {
      return {
        kind,
        available: on && hasPosition,
        note: !on
          ? "Pas encore possible : la météo n'est pas encore allumée par Boosteats."
          : !hasPosition ? NO_POSITION : "Pluie ou soleil annoncés pour le lendemain, d'après MET Norway.",
      };
    }
    return { kind, available: on && hasPosition, note: !hasPosition ? NO_POSITION : "Agenda de Bruxelles, à 1,5 km de chez toi au plus." };
  });
}
