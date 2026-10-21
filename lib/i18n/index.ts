// ============================================================
// Réserver un prestataire (ADR 0084 §5 terdecies) — côté SERVEUR : charge le dictionnaire de la langue demandée.
// À ne pas importer depuis un composant client (il embarquerait les trois langues) : un composant client lit `useT()`.
// ============================================================

import { makeTranslator, normalizeLocale, type Locale, type Messages, type Translator } from "./core";
import { fr } from "./messages/fr";
import { nl } from "./messages/nl";
import { en } from "./messages/en";

export * from "./core";

const DICTIONARIES: Record<Locale, Messages> = { fr, nl, en };

export function messagesFor(locale: Locale): Messages {
  return DICTIONARIES[locale] ?? fr;
}

/** Côté serveur : le traducteur d'une langue (une valeur inconnue ou absente donne le français). */
export function getT(locale: Locale | string | null | undefined): Translator {
  const l = normalizeLocale(locale);
  return makeTranslator(l, messagesFor(l));
}
