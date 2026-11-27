// ADR 0110 — ce que la console montre des offres : l'écran « Offres de ta page » et la carte d'une commande qui en avait
// affiché. Logique PURE et testée ; les lectures sont faites par les routes.

import type { OrderView } from "../site-orders/service";
import {
  STOP_LABEL, dayName, lastValidDay, offerPhase, whenLong, whenShort,
  type OfferAnswer, type OfferPhase, type OfferRow,
} from "./offers";

export type OfferCountsView = { seen: number; opened: number; orders: number };

export type ConsoleOffer = {
  id: string;
  phase: OfferPhase;
  title: string;
  conditions: string | null;
  itemId: string | null;
  dishName: string | null;
  firstDay: string;
  lastDay: string;
  weekdays: number[] | null;
  /** « Terminée le 3 décembre » : le mot en tête de la carte. */
  status: string;
  /** « Jusqu'au 12 décembre inclus. Publiée par Amina le 28 novembre. » */
  line: string | null;
  /** Les deux phrases de l'aperçu : sous le titre, et « Quand ». */
  short: string;
  long: string;
  /** Pourquoi les clients ne la voient pas. */
  warning: string | null;
  /** « Affichée 3 fois, ouverte 1 fois, 0 commande reçue pendant l'offre. » ; `null` sans offre à compter. */
  counts: string | null;
};

const brussels = (iso: string): string => new Date(iso).toLocaleDateString("fr-BE", { day: "numeric", month: "long", timeZone: "Europe/Brussels" }).replace(/^1 /, "1er ");

const times = (n: number) => `${n} fois`;
const received = (n: number) => `${n} ${n > 1 ? "commandes reçues" : "commande reçue"}`;

export function countsLine(c: OfferCountsView | undefined): string {
  return c ? `Affichée ${times(c.seen)}, ouverte ${times(c.opened)}, ${received(c.orders)} pendant l'offre.` : "Les chiffres de cette offre n'ont pas pu être lus.";
}

const ORDER: Record<OfferPhase, number> = { en_cours: 0, masquee: 1, a_venir: 2, brouillon: 3, terminee: 4, arretee: 5 };
/** Les offres finies ou arrêtées gardées à l'écran. */
export const PAST_MAX = 10;

export function consoleOffers(
  offers: readonly OfferRow[],
  p: { today: string; orderable: ReadonlySet<string>; dishNames: ReadonlyMap<string, string>; firstNames: ReadonlyMap<string, string>; counts: ReadonlyMap<string, OfferCountsView> | null },
): ConsoleOffer[] {
  const all = offers.map((o) => {
    const phase = offerPhase(o, p.today, p.orderable);
    const dishName = o.menu_item_id ? p.dishNames.get(o.menu_item_id) ?? null : null;
    const status =
      phase === "brouillon" ? "Brouillon"
      : phase === "a_venir" ? "À venir"
      : phase === "en_cours" ? "En cours"
      : phase === "masquee" ? "Masquée"
      : phase === "terminee" ? `Terminée le ${dayName(lastValidDay(o))}`
      : `Arrêtée le ${o.stopped_at ? brussels(o.stopped_at) : ""}${o.stop_reason ? ` : ${STOP_LABEL[o.stop_reason].toLocaleLowerCase("fr-BE")}` : ""}`;
    const who = o.published_by ? p.firstNames.get(o.published_by) : undefined;
    const published = o.published_at ? ` Publiée${who ? ` par ${who}` : ""} le ${brussels(o.published_at)}.` : "";
    // Une offre en cours qui ne vaut pas aujourd'hui le dit : le client ne la voit pas ce jour-là.
    const offDay = phase === "en_cours" && !o.weekdays?.includes(((new Date(`${p.today}T12:00:00Z`).getUTCDay() + 6) % 7) + 1) && o.weekdays !== null ? " Elle ne vaut pas aujourd'hui." : "";
    const line = phase === "en_cours" || phase === "a_venir" ? `${phase === "a_venir" ? whenLong(o) : whenShort(o, p.today)}.${offDay}${published}` : null;
    const warning =
      phase === "masquee"
        ? `Tes clients ne la voient pas : le plat ${dishName ? `« ${dishName} » ` : ""}n'est plus proposé à la commande.`
        : null;
    // Les chiffres d'une offre qui a pu être vue : en cours, masquée, finie ou arrêtée.
    const counted = phase === "en_cours" || phase === "masquee" || phase === "terminee" || phase === "arretee";
    return {
      id: o.id, phase, title: o.title, conditions: o.conditions, itemId: o.menu_item_id, dishName,
      firstDay: o.first_day, lastDay: o.last_day, weekdays: o.weekdays, status, line,
      short: whenShort(o, o.first_day > p.today ? o.first_day : p.today), long: whenLong(o), warning,
      counts: counted ? countsLine(p.counts?.get(o.id)) : null,
    };
  });
  const current = all.filter((o) => o.phase !== "terminee" && o.phase !== "arretee");
  const past = all.filter((o) => o.phase === "terminee" || o.phase === "arretee").slice(0, PAST_MAX);
  return [...current, ...past].sort((a, b) => ORDER[a.phase] - ORDER[b.phase] || a.lastDay.localeCompare(b.lastDay));
}

// ─── La carte d'une commande ─────────────────────────────────────────────────

export type OrderOfferView = { id: string; title: string; conditions: string | null; answer: OfferAnswer | null };
export type ConsoleOrder = OrderView & {
  offers: OrderOfferView[];
  /** La commande avait des offres, mais elles n'ont pas pu être lues : la carte le dit. */
  offersUnreadable: boolean;
};

/** `offers` = `null` : la lecture a échoué. Une offre arrêtée depuis reste due : l'état d'aujourd'hui n'est pas regardé. */
export function withOffers(
  orders: readonly OrderView[],
  offers: readonly Pick<OfferRow, "id" | "title" | "conditions">[] | null,
  answers: ReadonlyMap<string, OfferAnswer>,
): ConsoleOrder[] {
  return orders.map((o) => {
    const found = o.offerIds.flatMap((id) => {
      const offer = offers?.find((x) => x.id === id);
      return offer ? [{ id, title: offer.title, conditions: offer.conditions, answer: answers.get(`${o.id}/${id}`) ?? null }] : [];
    });
    return { ...o, offers: found, offersUnreadable: found.length < o.offerIds.length };
  });
}
