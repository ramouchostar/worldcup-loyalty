// ADR 0112 — le texte d'un article automatique : des PHRASES PRÉPARÉES à variantes, remplies avec les seuls faits de
// la source, le plat de la carte et les informations cochées. Aucune rédaction par une IA. PUR : les tests passent
// chaque variante dans le contrôle de publication (check.ts).

import { whenLong } from "../../site-offers/offers";
import { WEATHER_CREDIT } from "../credit";
import type { PostBlock, PostContent } from "../types";
import { LIMITS } from "../types";
import { brusselsDay, clockLabel, dayMonth, endOfDay, weekdayName } from "./time";
import type { AutoKind, EventCategory, EventFacts, Facts, MatchFacts, Offerings, PromoFacts, WeatherFacts } from "./types";

/** Combien de versions chaque type d'occasion sait écrire. « Autre version » prend la suivante. */
export const VARIANTS = 3;
export const nextVariant = (v: number): number => (v + 1) % VARIANTS;

/** Une première version qui change d'une occasion à l'autre, toujours la même pour la même occasion. */
export function initialVariant(sourceKey: string): number {
  let h = 0;
  for (let i = 0; i < sourceKey.length; i++) h = (h * 31 + sourceKey.charCodeAt(i)) >>> 0;
  return h % VARIANTS;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const CATEGORY: Record<EventCategory, { name: string; one: string; during: string; stay: string }> = {
  brocante: { name: "Brocante", one: "une brocante", during: "Entre deux stands", stay: "Tu préfères continuer à chiner ?" },
  foire: { name: "Foire", one: "une foire", during: "Entre deux stands", stay: "Tu préfères continuer ta balade ?" },
  fete: { name: "Fête", one: "une fête", during: "Avant ou après la fête", stay: "Tu préfères rester dans l'ambiance ?" },
  festival: { name: "Festival", one: "un festival", during: "Avant ou après le festival", stay: "Tu préfères ne rien manquer ?" },
  concert: { name: "Concert", one: "un concert", during: "Avant ou après le concert", stay: "Tu préfères ne pas t'attarder ?" },
};

export const categoryName = (c: EventCategory): string => CATEGORY[c].name;

/** « 600 m », « 1,2 km » (distance à vol d'oiseau, arrondie). */
export const distanceShort = (m: number): string => (m < 1000 ? `${m} m` : `${(Math.round(m / 100) / 10).toLocaleString("fr-BE")} km`);
const where = (m: number): string => (m < 100 ? "à quelques pas de chez nous" : `à ${distanceShort(m)} de chez nous`);

type Lines = { title: string; paragraphs: string[] };

function eventLines(f: EventFacts, o: Offerings, v: number): Lines {
  const c = CATEGORY[f.category];
  const day = weekdayName(f.day);
  const date = `${day} ${dayMonth(f.day)}`;
  const at = where(f.distanceM);
  const title = [`${c.name} ${day} : fais une pause chez nous`, `${c.name} ce ${day} près de chez nous`, `Ce ${day}, ${c.one} près de chez nous`][v];
  const fact = [
    `Ce ${date}, « ${f.name} » a lieu ${at}.`,
    `« ${f.name} » se tient ce ${date}, ${at}.`,
    `${cap(at)}, « ${f.name} » a lieu ce ${date}.`,
  ][v];
  const offer = o.onSite
    ? [
        `${c.during}, viens manger un morceau sur place. ${c.stay} Commande à emporter et retire ton repas au comptoir.`,
        "Pour manger, installe-toi sur place, ou commande à emporter et retire ton repas au comptoir.",
        `${c.during}, passe manger sur place. La commande à emporter marche aussi.`,
      ][v]
    : [
        `${c.during}, commande à emporter et retire ton repas au comptoir.`,
        "Une petite faim ? Commande à emporter et viens retirer ton repas.",
        `${c.stay} Commande à emporter et retire ton repas au comptoir.`,
      ][v];
  return { title, paragraphs: [fact, offer] };
}

function matchLines(f: MatchFacts, o: Offerings, v: number): Lines {
  const day = weekdayName(f.day);
  const at = clockLabel(f.kickoffUtc);
  const title = [`Match ce ${day} : commande à emporter`, `Ce ${day} soir, il y a match`, `Soir de match ce ${day}`][v];
  const fact = [
    `Ce ${day} ${dayMonth(f.day)} à ${at}, ${f.home} affronte ${f.away} (${f.competition}).`,
    `${f.home} joue contre ${f.away} ce ${day} à ${at}. Compétition : ${f.competition}.`,
    `Au programme ce ${day} à ${at} : ${f.home} contre ${f.away} (${f.competition}).`,
  ][v];
  const offer = o.screen
    ? [
        "Le match passe sur notre écran : viens le voir chez nous. Tu préfères ton canapé ? Commande à emporter.",
        "Notre écran diffuse le match. La commande à emporter marche aussi.",
        "Viens suivre le match sur notre écran, ou commande à emporter.",
      ][v]
    : o.onSite
      ? [
          "Avant le coup d'envoi, mange sur place ou commande à emporter.",
          "Passe manger sur place avant le match, ou commande à emporter.",
          "Avant le match, installe-toi sur place ou emporte ton repas.",
        ][v]
      : [
          "Passe ta commande à emporter avant le coup d'envoi et retire ton repas au comptoir.",
          "Pour manger devant le match, commande à emporter et viens chercher ton repas.",
          "Commande à emporter : retire ton repas au comptoir et rentre à temps pour le match.",
        ][v];
  return { title, paragraphs: [fact, offer] };
}

function weatherLines(f: WeatherFacts, o: Offerings, v: number): Lines {
  const day = weekdayName(f.day);
  const date = `${day} ${dayMonth(f.day)}`;
  const when = f.service === "midi" ? "à midi" : "en soirée";
  // Chaque titre dit le moment : la prévision lue ne porte que sur ces heures-là, jamais sur la journée.
  if (f.sky === "pluie") {
    return {
      title: [`Pluie annoncée ${day} ${when} : commande à emporter`, `${cap(day)} ${when}, la pluie est annoncée`, `Pluie annoncée ce ${day} ${when}`][v],
      paragraphs: [
        [`La météo annonce de la pluie ce ${date} ${when}.`, `De la pluie est annoncée ce ${date} ${when}.`, `Ce ${date} ${when}, la météo prévoit de la pluie.`][v],
        o.onSite
          ? ["Viens manger au sec, sur place, ou commande à emporter.", "Mets-toi à l'abri : mange sur place ou emporte ton repas.", "Sur place ou à emporter, à toi de choisir."][v]
          : ["Commande à emporter, puis viens retirer ton repas.", "Passe ta commande à emporter et retire ton repas au comptoir.", "Prépare ta commande à emporter avant de sortir."][v],
      ],
    };
  }
  return {
    title: [`Soleil annoncé ce ${day} à midi`, `${cap(day)} à midi, le soleil est annoncé`, `Du soleil annoncé ce ${day} à midi`][v],
    paragraphs: [
      [`La météo annonce du soleil ce ${date} ${when}.`, `Du soleil est annoncé ce ${date} ${when}.`, `Ce ${date} ${when}, la météo prévoit du soleil.`][v],
      o.terrace
        ? ["Notre terrasse est là pour en profiter.", "Viens manger en terrasse, ou commande à emporter.", "Terrasse ou à emporter, à toi de choisir."][v]
        : ["Commande à emporter et mange dehors si le cœur t'en dit.", "Commande à emporter et viens retirer ton repas.", "Une envie de manger dehors ? Commande à emporter."][v],
    ],
  };
}

/**
 * Une offre : son titre tel que le restaurant l'a écrit, ses jours, et ce que la page en dit (aucun prix changé, la remise se
 * demande au comptoir). Les conditions ne sont pas recopiées : on dit qu'elles existent et où les lire.
 */
function promoLines(f: PromoFacts, v: number): Lines {
  const name = f.label.replace(/[\s.!?…:;,]+$/, "");
  const long = whenLong({ first_day: f.startsDay, last_day: f.endsDay, weekdays: f.weekdays });
  const when = long.charAt(0).toLowerCase() + long.slice(1);
  // Un titre coupé pourrait perdre une restriction : s'il ne tient pas avec un préambule, il paraît seul.
  const title = [f.label, `En ce moment : ${f.label}`, `Notre offre : ${f.label}`][v];
  const paragraphs = [
    [`Notre offre « ${name} » vaut ${when}.`, `« ${name} » : c'est notre offre, ${when}.`, `Voici notre offre, valable ${when} : « ${name} ».`][v],
    [
      "La remise se fait au comptoir : le total en ligne ne la compte pas. Envoie ta commande à emporter, puis dis au comptoir que tu as vu cette offre.",
      "Commande à emporter, puis demande cette offre au comptoir en retirant ton repas. Le total affiché en ligne ne la compte pas.",
      "En ligne, les prix ne changent pas. Demande cette offre au comptoir quand tu retires ta commande à emporter.",
    ][v],
  ];
  if (f.hasConditions) paragraphs.push("Des conditions s'appliquent : elles sont écrites avec l'offre, sur notre page de commande, les jours où elle vaut.");
  return { title: title.length > LIMITS.title ? f.label : title, paragraphs };
}

function lines(facts: Facts, offerings: Offerings, v: number): Lines {
  switch (facts.kind) {
    case "evenement": return eventLines(facts, offerings, v);
    case "match": return matchLines(facts, offerings, v);
    case "meteo": return weatherLines(facts, offerings, v);
    case "promo": return promoLines(facts, v);
  }
}

const trimTo = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);

/** L'article d'une occasion : un titre, deux paragraphes et, s'il y en a un, le plat de la carte. */
export function compose(facts: Facts, p: { offerings: Offerings; dishId: string | null; variant: number }): PostContent {
  const v = ((Math.trunc(p.variant) % VARIANTS) + VARIANTS) % VARIANTS;
  const l = lines(facts, p.offerings, v);
  const blocks: PostBlock[] = l.paragraphs.map((text) => ({ type: "p", text }));
  if (p.dishId) blocks.push({ type: "dish", itemId: p.dishId });
  return { title: trimTo(l.title, LIMITS.title), blocks };
}

// ─── Ce que la console dit d'une occasion ────────────────────────────────────

/** Le nom court de l'occasion (« Pas publiés »). */
export function occasionLabel(facts: Facts): string {
  const raw =
    facts.kind === "evenement" ? facts.name
    : facts.kind === "match" ? `${facts.home} contre ${facts.away}`
    : facts.kind === "meteo" ? `${facts.sky === "pluie" ? "Pluie annoncée" : "Soleil annoncé"} ${weekdayName(facts.day)}`
    : facts.label;
  return trimTo(raw, 120);
}

/** « Brocante à 600 m. Source : agenda de Bruxelles. » */
export function sourceLine(facts: Facts): string {
  switch (facts.kind) {
    case "evenement": return `${categoryName(facts.category)} à ${distanceShort(facts.distanceM)}. Source : agenda de Bruxelles.`;
    case "match": return `Match à ${clockLabel(facts.kickoffUtc)}. Source : calendrier des matchs.`;
    case "meteo": return `${facts.sky === "pluie" ? "Pluie" : "Soleil"} ${facts.service === "midi" ? "à midi" : "en soirée"}. Source : prévision de MET Norway.`;
    case "promo": return "Ton offre. Source : tes offres.";
  }
}

/** « D'où viennent les informations », sous l'aperçu. */
export function sourceDetails(facts: Facts, p: { hasDish: boolean; offerings: Offerings; expiresAt: string }): string[] {
  const out = [
    facts.kind === "evenement" ? "Nom, date et distance à vol d'oiseau : agenda de Bruxelles."
    : facts.kind === "match" ? "Équipes, compétition et heure : calendrier des matchs."
    : facts.kind === "meteo" ? "Temps annoncé : prévision de MET Norway (pluie heure par heure, nuages, température), résumée."
    : "Titre, jours et dates : ton offre.",
  ];
  if (p.hasDish) out.push("Plat et prix : ta carte.");
  const ticked = p.offerings.onSite || p.offerings.terrace || p.offerings.screen;
  out.push(ticked ? "Ce que tu proposes (sur place, terrasse, écran) : les infos de ta page." : "« À emporter » : ta page de commande.");
  out.push(`Retiré tout seul ${endLabel(p.expiresAt, facts.day)}${facts.kind === "promo" ? ", ou dès que ton offre s'arrête" : ""}.`);
  return out;
}

/** « samedi soir » quand l'article tient jusqu'à minuit (avec la date si c'est un autre jour), sinon « samedi à 23 h 45 ». */
export function endLabel(expiresAt: string, day: string): string {
  if (new Date(expiresAt).getTime() === new Date(endOfDay(day)).getTime()) return `${weekdayName(day)} soir`;
  const eve = brusselsDay(new Date(Date.parse(expiresAt) - 60_000));
  if (new Date(expiresAt).getTime() === new Date(endOfDay(eve)).getTime()) return `${weekdayName(eve)} ${dayMonth(eve)} au soir`;
  const last = new Date(expiresAt).toLocaleDateString("fr-BE", { weekday: "long", timeZone: "Europe/Brussels" });
  return `${last} à ${clockLabel(expiresAt)}`;
}

/** La mention de source écrite sous l'article, que le client lit. `null` : aucune. */
export function sourceCredit(kind: AutoKind): string | null {
  if (kind === "evenement") return "Informations sur l'événement : agenda.brussels (visit.brussels).";
  if (kind === "match") return "Calendrier des matchs : Bzzoiro Sports Data.";
  if (kind === "meteo") return WEATHER_CREDIT;
  return null;
}
