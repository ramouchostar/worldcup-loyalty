"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { fr } from "@/lib/i18n/messages/fr";
import { makeTranslator, type Locale, type Messages, type Translator } from "@/lib/i18n/core";

// ADR 0084 §5 terdecies — la langue de l'écran, donnée par le serveur (la page connaît l'utilisateur). Sans fournisseur au-dessus
// (toute la console restaurateur d'aujourd'hui), on lit le français : aucun écran existant ne change.

const Ctx = createContext<Translator>(makeTranslator("fr", fr));

export function I18nProvider({ locale, messages, children }: { locale: Locale; messages: Messages; children: ReactNode }) {
  const value = useMemo(() => makeTranslator(locale, messages), [locale, messages]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useT = (): Translator => useContext(Ctx);
