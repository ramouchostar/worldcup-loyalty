// ADR 0109 §3 — l'écran « Infos de ma page » de la console : ce qu'il montre et ce qu'un geste écrit. Logique PURE et testée ;
// les lectures et écritures sont faites par la route (`app/api/admin/site-orders/info/route.ts`).
//
// Les badges disent d'où vient chaque information : « Google » = lue à l'instant sur la fiche (pour le téléphone et l'adresse,
// identique à ce que la fiche dit maintenant), « Toi » = saisie par le restaurant. Rien de Google n'est gardé pour cela.

import { brusselsDay } from "./order";
import type { FicheRead } from "./fiche";
import { googleBase, serviceDay, type Openness } from "./hours";
import { dayToClose, decideHours, usesOwnHours, type HoursCause, type HoursOrigin } from "./hours-source";
import {
  addClosure, checkContact, checkHoursChoice, checkOffers, closureLabel, presentationLine, removeClosure, type Offers, type PageSettings,
} from "./page-settings";
import { googleWeekly, weeklySummary, type WeeklyHours } from "./weekly-hours";
import type { Closure } from "./hours";

export type InfoSource = "google" | "toi" | null;
export type ContactRow = { value: string | null; source: InfoSource };

export type PageInfo = {
  activated: boolean;
  /** L'instant de la lecture, à l'horloge du serveur. */
  readAt: string;
  name: string;
  state: { openness: Openness; origin: HoursOrigin; cause: HoursCause | null };
  hours: { source: InfoSource; lines: string[] };
  phone: ContactRow;
  address: ContactRow;
  /** `value` vide : la page compose la phrase avec le type de cuisine (`shown`). */
  presentation: { value: string | null; shown: string };
  offers: Offers;
  /** « Fermer pour aujourd'hui » est posé : le bouton propose de rouvrir. */
  closedToday: boolean;
  /** Un jour spécial ferme le jour en cours : « 25 décembre : fermé ». */
  plannedClosure: string | null;
  attributions: { provider: string; url: string | null }[];
};

export type Contact = { name: string; phone: string | null; address: string | null; cuisine: string | null };

const phoneKey = (v: string) => v.replace(/\D/g, "").replace(/^(0032|32)/, "0");
const addressKey = (v: string) => v.toLowerCase().replace(/,?\s*belgi(que|um|ë)\s*$/i, "").replace(/[\s,]+/g, " ").trim();

function contactRow(value: string | null, google: string | null | undefined, key: (v: string) => string, read: FicheRead): ContactRow {
  if (!value) return { value: null, source: null };
  if (!read.ok) return { value, source: null }; // la fiche ne se lit pas : on ne sait pas, on ne dit rien
  return { value, source: google && key(google) === key(value) ? "google" : "toi" };
}

function hoursRow(s: PageSettings, read: FicheRead, now: Date): PageInfo["hours"] {
  const own = (): PageInfo["hours"] => ({ source: "toi", lines: weeklySummary(s.weekly!) });
  if (usesOwnHours(s)) return own();
  if (read.ok) {
    const regular = googleWeekly(read.info.regularOpeningHours);
    const base = googleBase({ businessStatus: read.info.businessStatus, current: read.info.currentOpeningHours, regular: read.info.regularOpeningHours }, now);
    if (base.kind === "closed" && !regular) return { source: "google", lines: ["Ta fiche Google dit « fermé »."] };
    if (base.kind !== "unknown") {
      return { source: "google", lines: regular ? weeklySummary(regular) : ["Horaires des prochains jours lus sur ta fiche."] };
    }
  }
  if (s.weekly) return own();
  return { source: null, lines: [!read.ok && read.cause === "lecture_impossible" ? "Google ne répond pas pour le moment." : "Aucun horaire."] };
}

export function pageInfo(input: { settings: PageSettings; contact: Contact; read: FicheRead; now: Date }): PageInfo {
  const { settings: s, contact, read, now } = input;
  const { openness, origin, cause } = decideHours(s, read, now);
  const day = serviceDay(now);
  const planned = s.closures.find((c) => c.from <= day && day <= c.to);
  const hours = hoursRow(s, read, now);
  const phone = contactRow(contact.phone, read.ok ? read.info.phone : null, phoneKey, read);
  const address = contactRow(contact.address, read.ok ? read.info.address : null, addressKey, read);
  const fromGoogle = [hours.source, phone.source, address.source].includes("google") || origin === "google";
  return {
    activated: s.activated,
    readAt: now.toISOString(),
    name: contact.name,
    state: { openness, origin, cause },
    hours,
    phone,
    address,
    presentation: { value: s.presentation, shown: presentationLine({ presentation: s.presentation, cuisine: contact.cuisine }) },
    offers: s.offers,
    closedToday: s.closedToday !== null && s.closedToday >= day,
    plannedClosure: planned ? closureLabel(planned) : null,
    attributions: read.ok && fromGoogle
      ? read.info.attributions.flatMap((a) => {
          const provider = (a.provider ?? "").trim();
          return provider === "" ? [] : [{ provider, url: a.providerUri && /^https?:\/\//.test(a.providerUri) ? a.providerUri : null }];
        })
      : [],
  };
}

/** L'écran « Mes horaires » : rien de Google n'y est lu. */
export type HoursEditorData = { activated: boolean; source: "google" | "manual"; weekly: WeeklyHours | null; closures: (Closure & { label: string })[]; today: string };

export function hoursEditorData(s: PageSettings, now: Date): HoursEditorData {
  const today = serviceDay(now);
  return {
    activated: s.activated,
    source: s.source,
    weekly: s.weekly,
    closures: s.closures.filter((c) => c.to >= today).map((c) => ({ ...c, label: closureLabel(c) })),
    today,
  };
}

export type InfoPlan =
  | { ok: true; write: { kind: "reglages"; patch: Record<string, unknown> } | { kind: "restaurant"; field: "phone" | "address"; value: string | null } }
  | { ok: false; status: number; error: string };

const refused = (error: string, status = 400): InfoPlan => ({ ok: false, status, error });
const settingsWrite = (patch: Record<string, unknown>): InfoPlan => ({ ok: true, write: { kind: "reglages", patch } });

/**
 * Ce qu'un geste de la console doit écrire. Le téléphone et l'adresse vont dans leurs colonnes de `restaurants` (même sans la
 * migration) ; tout le reste dans `site_page_settings`. `openness` n'est lu que si la réponse en dépend : « Fermer pour
 * aujourd'hui » entre minuit et 5 h, quand le service de la veille peut encore courir.
 */
export async function planInfoAction(body: unknown, settings: PageSettings, now: Date, openness: () => Promise<Openness>): Promise<InfoPlan> {
  if (typeof body !== "object" || body === null) return refused("Requête invalide.");
  const b = body as Record<string, unknown>;
  if (b.action === "contact") {
    const checked = checkContact(b.field, b.value);
    if (!checked.ok) return refused(checked.message);
    const { field, value } = checked.value;
    if (field !== "presentation") return { ok: true, write: { kind: "restaurant", field, value } };
    if (!settings.activated) return refused("Cette fonction n'est pas encore activée.", 503);
    return settingsWrite({ presentation: value });
  }
  if (!settings.activated) return refused("Cette fonction n'est pas encore activée.", 503);
  switch (b.action) {
    case "offers": {
      const checked = checkOffers(b.offers);
      if (!checked.ok) return refused(checked.message);
      return settingsWrite({ offers_terrace: checked.value.terrace, offers_dine_in: checked.value.dineIn, offers_match_screen: checked.value.matchScreen });
    }
    case "hours": {
      const checked = checkHoursChoice(b, settings);
      if (!checked.ok) return refused(checked.message);
      return settingsWrite({ hours_source: checked.value.source, weekly_hours: checked.value.weekly });
    }
    case "add_closure": {
      const checked = addClosure(settings.closures, b, serviceDay(now));
      if (!checked.ok) return refused(checked.message);
      return settingsWrite({ closures: checked.value });
    }
    case "remove_closure":
      return settingsWrite({ closures: removeClosure(settings.closures, b) });
    case "close_today": {
      const calendar = brusselsDay(now);
      const day = serviceDay(now) === calendar ? calendar : dayToClose(await openness(), now, calendar);
      return settingsWrite({ closed_today: day });
    }
    case "reopen_today":
      return settingsWrite({ closed_today: null });
    default:
      return refused("Requête invalide.");
  }
}
