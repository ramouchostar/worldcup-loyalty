import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { LOCALES, dayLabel, formatEurosL, getT, humanSizeL, interpolate, isLocale, makeTranslator, messagesFor, monthLabel, normalizeLocale, weekdayShort } from "./index";
import { fr } from "./messages/fr";
import { nl } from "./messages/nl";
import { en } from "./messages/en";
import { dateLabelFr } from "../mission-team-message";

const KEYS = Object.keys(fr).sort();
const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const flat = (s: string) => s.replace(/\s/g, " ");

test("le néerlandais et l'anglais ont exactement les clés du français", () => {
  assert.deepEqual(Object.keys(nl).sort(), KEYS);
  assert.deepEqual(Object.keys(en).sort(), KEYS);
});

test("aucun texte vide, et les {variables} sont les mêmes dans les trois langues", () => {
  for (const k of KEYS) {
    for (const [name, d] of [["fr", fr], ["nl", nl], ["en", en]] as const) {
      const text = (d as Record<string, string>)[k];
      assert.ok(text && text.trim().length > 0, `${name}:${k} est vide`);
      assert.deepEqual(vars(text), vars((fr as Record<string, string>)[k]), `${name}:${k} n'a pas les mêmes {variables} que le français`);
    }
  }
});

test("chaque pluriel a ses deux formes dans les trois langues", () => {
  for (const k of KEYS.filter((k) => k.endsWith(".one"))) {
    const base = k.slice(0, -4);
    for (const d of [fr, nl, en] as Record<string, string>[]) assert.ok(`${base}.other` in d, `${base}.other manque`);
  }
  for (const k of KEYS.filter((k) => k.endsWith(".other") && !k.startsWith("canon."))) assert.ok(`${k.slice(0, -6)}.one` in fr, `${k} sans .one`);
});

test("rien n'est resté en français dans les autres langues (hors mots identiques connus)", () => {
  // Mots qui s'écrivent pareil dans deux langues (Design, Photo, Boosteats, « message(s) », Montage…).
  const SAME: Record<string, string[]> = {
    nl: ["metier.design", "msg.platform", "canon.included.Montage", "proposals.field.ideaCount", "em.brief.title", "canon.noteCat.Retouche", "canon.noteCat.Logo", "canon.role.Barman", "rc.change.count", "rc.bat.sum.paper", "dur.min"],
    en: ["metier.design", "metier.photo", "inbox.unread.one", "inbox.unread.other", "mission.version", "msg.title", "msg.platform", "proposals.field.ideaCount", "em.invite.eyebrow", "em.brief.title", "canon.noteCat.Logo", "canon.noteCat.Photo", "canon.noteCat.QR code", "canon.noteCat.Format", "rc.change.count", "rc.plan.advice.ok", "dur.min", "dur.h", "dur.hm"],
  };
  for (const [name, d] of [["nl", nl], ["en", en]] as const) {
    const same = KEYS.filter((k) => (d as Record<string, string>)[k] === (fr as Record<string, string>)[k]);
    assert.deepEqual(same, [...SAME[name]].sort(), `${name} : textes restés en français`);
  }
});

test("pas de tutoiement oublié ni de « vous » en français", () => {
  for (const k of KEYS.filter((k) => !k.startsWith("rc.msg."))) assert.doesNotMatch((fr as Record<string, string>)[k], /\bvous\b/i, k);
});

test("une langue inconnue donne le français", () => {
  assert.equal(normalizeLocale("de"), "fr");
  assert.equal(normalizeLocale(undefined), "fr");
  assert.equal(normalizeLocale(null), "fr");
  assert.equal(normalizeLocale("nl"), "nl");
  assert.equal(isLocale("en"), true);
  assert.equal(isLocale("EN"), false);
  assert.equal(getT("xx").locale, "fr");
  assert.equal(messagesFor("nl"), nl);
});

test("t : variables remplacées, variable oubliée visible, clé inconnue = français puis la clé", () => {
  const { t } = getT("nl");
  assert.equal(t("revenue.row.quote", { price: "100 €" }), "offerteprijs 100 €");
  assert.equal(interpolate("a {x} b {y}", { x: 1 }), "a 1 b {y}");
  assert.equal(interpolate("rien", undefined), "rien");
  // Un dictionnaire incomplet (jamais en vrai : le typage l'interdit) retombe sur le français.
  const partial = makeTranslator("nl", { ...nl, "nav.profile": undefined as unknown as string });
  assert.equal(partial.t("nav.profile"), fr["nav.profile"]);
  assert.equal(makeTranslator("fr", fr).t("zzz" as never), "zzz");
});

test("tp : un au singulier, le reste au pluriel, {n} disponible", () => {
  for (const l of LOCALES) {
    const { tp } = getT(l);
    assert.match(tp("inbox.unread", 1), /^1 /);
    assert.match(tp("inbox.unread", 0), /^0 /);
    assert.match(tp("inbox.unread", 3), /^3 /);
  }
  assert.equal(getT("fr").tp("inbox.unread", 1), "1 message");
  assert.equal(getT("fr").tp("inbox.unread", 2), "2 messages");
  assert.equal(getT("en").tp("avail.savedExcept", 1), "Saved, except 1 day already booked by a restaurateur.");
});

test("l'argent suit la langue", () => {
  assert.equal(flat(formatEurosL(123_450, "fr")), "1 234,50 €");
  assert.equal(flat(formatEurosL(87_500, "fr")), "875 €");
  assert.equal(flat(formatEurosL(123_450, "nl")), "€ 1.234,50");
  assert.equal(flat(formatEurosL(123_450, "en")), "€1,234.50");
});

test("les jours et les mois suivent la langue, et le français reste celui d'avant", () => {
  assert.equal(dayLabel("2026-10-20", "fr"), "mardi 20 octobre");
  assert.equal(dayLabel("2026-10-20", "nl"), "dinsdag 20 oktober");
  assert.equal(dayLabel("2026-10-20", "en"), "Tuesday 20 October");
  assert.equal(dayLabel("pas-un-jour", "fr"), "pas-un-jour");
  // Le calendrier du restaurateur lisait dateLabelFr : le même texte, pour chaque jour d'une année entière.
  for (let i = 0; i < 366; i++) {
    const day = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
    assert.equal(dayLabel(day, "fr"), dateLabelFr(day), day);
  }
  assert.equal(monthLabel("2026-10", "fr"), "octobre 2026");
  assert.equal(monthLabel("2026-10", "nl"), "oktober 2026");
  assert.equal(monthLabel("2026-10", "en"), "October 2026");
  assert.equal(weekdayShort("fr").length, 7);
  assert.match(weekdayShort("fr")[0], /^lun/);
  assert.match(weekdayShort("nl")[0], /^ma/);
  assert.match(weekdayShort("en")[0], /^Mon/);
});

// ── Frontière client : un composant client ne doit jamais embarquer les trois langues ──
function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".") || name === ".next") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

test("aucun composant client n'importe l'index des dictionnaires (il embarquerait les trois langues)", () => {
  const offenders = [...sources("app"), ...sources("components")].filter((f) => {
    const s = readFileSync(f, "utf8");
    return /^["']use client["']/m.test(s.slice(0, 200)) && /from ["']@\/lib\/i18n(\/index)?["']/.test(s);
  });
  assert.deepEqual(offenders, []);
  const provider = readFileSync("components/i18n/I18nProvider.tsx", "utf8");
  assert.doesNotMatch(provider, /messages\/(nl|en)/);
  assert.match(readFileSync("lib/i18n/core.ts", "utf8"), /from "\.\/messages\/fr"/);
  assert.doesNotMatch(readFileSync("lib/i18n/core.ts", "utf8"), /messages\/(nl|en)/);
});

// ── Les données écrites en français (prestations, raisons) s'affichent dans la langue de celui qui lit ──
import { QUOTE_INCLUDES, REFUSAL_REASONS } from "../mission-quote";
import { REPORT_MISSING_OPTIONS } from "../mission-dayof";
import { PROVIDER_REFUSAL_REASONS } from "../mission-changes";
import { PROVIDER_REASONS, RESTAURANT_REASONS, describeCostT, describeCost, type CancelQuote } from "../mission-cancel-rules";

test("chaque prestation et chaque raison enregistrée a sa traduction, et la donnée n'est jamais modifiée", () => {
  for (const l of LOCALES) {
    const tr = getT(l);
    for (const metier of Object.keys(QUOTE_INCLUDES) as (keyof typeof QUOTE_INCLUDES)[]) {
      for (const item of QUOTE_INCLUDES[metier]) assert.ok(`canon.included.${item}` in fr, `canon.included.${item} manque`), assert.ok(tr.canon("included", item).length > 0);
    }
    for (const r of REFUSAL_REASONS.filter((r) => r !== "Autre raison")) assert.ok(`canon.refuse.${r}` in fr, r);
    for (const r of [...PROVIDER_REASONS, ...RESTAURANT_REASONS].filter((r) => r !== "Autre raison")) assert.ok(`canon.cancel.${r}` in fr, r);
    for (const r of REPORT_MISSING_OPTIONS) assert.ok(`canon.report.${r}` in fr, r);
    for (const r of PROVIDER_REFUSAL_REASONS.filter((r) => r !== "Autre raison")) assert.ok(`canon.changeRefuse.${r}` in fr, r);
  }
  assert.equal(getT("nl").canon("included", "Montage"), "Montage");
  assert.equal(getT("nl").canon("included", "Sous-titres"), "Ondertitels");
  assert.equal(getT("en").canon("cancel", "Je suis malade"), "I'm ill");
  assert.equal(getT("nl").canon("refuse", "Autre raison"), "Andere reden");
  assert.equal(getT("fr").canon("refuse", "Autre raison"), "Autre raison");
  // Du texte libre n'a pas de traduction : il reste tel quel.
  assert.equal(getT("en").canon("included", "Un truc à moi"), "Un truc à moi");
});

test("err : une cause connue a sa phrase, le français garde le texte précis du serveur, sinon le repli", () => {
  assert.equal(getT("nl").err({ reason: "not_found", error: "Mission introuvable." }, "err.generic"), "Opdracht niet gevonden.");
  assert.equal(getT("fr").err({ reason: "zzz", error: "Texte précis du serveur." }, "err.generic"), "Texte précis du serveur.");
  assert.equal(getT("en").err({ reason: "zzz", error: "Texte précis du serveur." }, "err.generic"), "Not possible right now. Try again.");
  assert.equal(getT("en").err(null, "err.generic"), "Not possible right now. Try again.");
});

test("le coût d'une annulation est dit dans chaque langue, sans variable oubliée, et le français est celui d'avant", () => {
  const base = { band: "half", beforeDate: false, studio: null, outcome: { retainedCents: 50_000 } } as unknown as CancelQuote;
  const cases: CancelQuote[] = [
    base,
    { ...base, band: "free" } as CancelQuote,
    { ...base, band: "full" } as CancelQuote,
    { ...base, beforeDate: true } as CancelQuote,
    { ...base, studio: { started: true, depositCents: 10_000 } } as unknown as CancelQuote,
    { ...base, studio: { started: false, depositCents: 10_000 } } as unknown as CancelQuote,
  ];
  for (const by of ["restaurant", "provider"] as const) {
    for (const q of cases) {
      assert.equal(describeCostT(getT("fr"), by, q, (c) => `${c / 100} €`), describeCost(by, q, (c) => `${c / 100} €`));
      for (const l of ["nl", "en"] as const) {
        const text = describeCostT(getT(l), by, q, (c) => `${c / 100} €`);
        assert.ok(text.length > 10);
        assert.doesNotMatch(text, /\{\w+\}/, `${l} : variable oubliée`);
      }
    }
  }
});

test("les erreurs connues du serveur ont leur phrase dans chaque langue", () => {
  for (const reason of ["too_early", "not_booked", "locked", "not_started", "no_report", "no_bat", "not_awaiting_delivery", "not_expected", "reason_short", "reason_long", "too_late", "invalid", "already_signed", "awaiting_review", "no_rounds_left", "not_production", "not_print", "not_found", "unavailable"]) {
    assert.ok(`err.${reason}` in fr, `err.${reason} manque`);
    for (const l of LOCALES) assert.equal(getT(l).err({ reason, error: "x" }, "err.generic"), getT(l).t(`err.${reason}` as never), `${l}:${reason}`);
  }
});

test("les tailles de fichier suivent la langue", () => {
  assert.equal(humanSizeL(500, "fr"), "500 o");
  assert.equal(humanSizeL(2048, "nl"), "2 KB");
  assert.equal(humanSizeL(1_572_864, "fr"), "1,5 Mo");
  assert.equal(humanSizeL(1_572_864, "nl"), "1,5 MB");
  assert.equal(humanSizeL(1_572_864, "en"), "1.5 MB");
});

// ── Profil et invitation ──
import { PROFILE_ISSUE_TEXT, PROFILE_LANGUAGES } from "../provider-profile";
import { URL_ISSUE_TEXT } from "../safe-url";

test("chaque refus du profil, chaque motif d'adresse et chaque langue ont leur texte dans les trois langues", () => {
  for (const code of Object.keys(PROFILE_ISSUE_TEXT)) assert.ok(`profile.issue.${code}` in fr, `profile.issue.${code}`);
  for (const code of Object.keys(URL_ISSUE_TEXT)) assert.ok(`profile.url.${code}` in fr, `profile.url.${code}`);
  for (const l of PROFILE_LANGUAGES) assert.ok(`canon.language.${l}` in fr, l);
  assert.equal(getT("nl").canon("language", "Anglais"), "Engels");
  assert.equal(getT("en").canon("language", "Néerlandais"), "Dutch");
});

test("la page d'invitation a un texte pour chaque cause d'échec, dans les trois langues", () => {
  for (const state of ["expired", "accepted", "revoked", "not-found", "email-mismatch", "already-provider", "error"]) {
    assert.ok(`invite.error.${state}` in fr, state);
    for (const l of LOCALES) assert.ok(getT(l).t(`invite.error.${state}` as never).length > 5);
  }
});

test("la carte « À propos » parle la langue du lecteur et le français reste celui d'avant", () => {
  assert.equal(getT("fr").t("card.title"), "À propos du prestataire");
  assert.equal(getT("nl").t("card.rating", { avg: "4,5", count: 7 }), "4,5 op 5 · 7 beoordelingen");
  assert.equal(getT("en").t("card.rating", { avg: "4.5", count: 7 }), "4.5 out of 5 · 7 reviews");
});

// ── Lot 8 : cartes du restaurateur ──
import { CHANGE_CATEGORIES } from "../mission-changes";
import { BAT_NOTE_CATEGORIES, batChecklist, batChecklistT } from "../mission-print";
import { DESIGN_NOTE_CATEGORIES, PHOTO_NOTE_CATEGORIES, VIDEO_NOTE_CATEGORIES } from "../mission-brief";
import { conceptMessage, conceptMessageT, teamMessage, teamMessageT } from "../mission-team-message";
import { roundsLabel, roundsLabelT } from "../mission-retouch";
import { formatDuration, formatDurationT } from "../mission-dayof";

test("chaque catégorie de remarque et de changement a sa traduction", () => {
  const nlT = makeTranslator("nl", nl);
  const enT = makeTranslator("en", en);
  for (const c of CHANGE_CATEGORIES) for (const tr of [nlT, enT]) assert.ok(tr.canon("changeCat", c).length > 0, `changeCat:${c}`);
  for (const c of [...VIDEO_NOTE_CATEGORIES, ...PHOTO_NOTE_CATEGORIES, ...DESIGN_NOTE_CATEGORIES, ...BAT_NOTE_CATEGORIES]) {
    for (const tr of [nlT, enT]) assert.ok(`canon.noteCat.${c}` in (tr.locale === "nl" ? nl : en), `noteCat:${c}`);
  }
  for (const c of CHANGE_CATEGORIES) assert.ok(`canon.changeCat.${c}` in nl && `canon.changeCat.${c}` in en, `changeCat:${c}`);
});

test("le message à l'équipe, le BAT, la durée et les tours : le français par clés est celui d'avant", () => {
  const trFr = makeTranslator("fr", fr);
  const base = { shootDate: "2026-11-03", startTime: "14:00", providerName: "Léa", roles: ["Gérant", "Chef"], kitchen: "Oui", contactName: "Omar", contactPhone: "0470 00 00 00" };
  assert.equal(teamMessageT(trFr, base), teamMessage(base));
  assert.equal(conceptMessageT(trFr, { shootDate: "2026-11-03", startTime: "14:00", providerName: "Léa", title: "Le burger", onsite: "3 burgers" }), conceptMessage({ shootDate: "2026-11-03", startTime: "14:00", providerName: "Léa", title: "Le burger", onsite: "3 burgers" }));
  for (const n of [0, 1, 2]) assert.equal(roundsLabelT(trFr, n), roundsLabel(n));
  for (const m of [5, 60, 95]) assert.equal(formatDurationT(trFr, m), formatDuration(m));
  assert.deepEqual(batChecklistT({}, trFr).map((c) => c.key), batChecklist({}).map((c) => c.key));
});

test("le message à l'équipe parle la langue du restaurateur", () => {
  const input = { shootDate: "2026-11-03", startTime: "14:00", providerName: "Léa", roles: ["Chef"], contactName: "Omar", contactPhone: "0470 00 00 00" };
  assert.notEqual(teamMessageT(makeTranslator("nl", nl), input), teamMessage(input));
  assert.notEqual(teamMessageT(makeTranslator("en", en), input), teamMessage(input));
});
