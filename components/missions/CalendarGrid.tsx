"use client";

import { useT } from "@/components/i18n/I18nProvider";
import { dayLabel, monthLabel, weekdayShort } from "@/lib/i18n/core";

// ADR 0084 §5 — la grille de calendrier partagée par le restaurateur (il choisit UN jour) et le
// prestataire (il en bloque plusieurs). Mobile d'abord : sept colonnes, des cibles de 44 px,
// l'état de chaque jour dit en mots pour les lecteurs d'écran (jamais par la couleur seule).
// Présentation seule : l'état de chaque jour est décidé par lib/mission-dates.ts.

export type GridDay = {
  date: string;
  weekday: number; // 0 = lundi
  /** Texte lu par un lecteur d'écran : « Libre », « Bloqué », « Déjà réservé »… */
  label: string;
  /** Un jour qu'on ne peut pas choisir. */
  disabled: boolean;
  /** Mis en avant (jour calme conseillé). */
  hint?: boolean;
  /** Barré (indisponible ou réservé). */
  struck?: boolean;
};

function weeksOf(days: GridDay[]): GridDay[][] {
  const weeks: GridDay[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

export function CalendarGrid({ days, selected, onPick }: { days: GridDay[]; selected: ReadonlySet<string>; onPick: (date: string) => void }) {
  const { t, locale } = useT();
  const weekdays = weekdayShort(locale);
  let lastMonth = "";
  return (
    <div className="space-y-1" role="group" aria-label={t("avail.calendar")}>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-mono uppercase tracking-wider text-ink-faint" aria-hidden>
        {weekdays.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      {weeksOf(days).map((week) => {
        const monday = week[0];
        const month = monday.date.slice(0, 7);
        const heading = month !== lastMonth ? monthLabel(month, locale) : null;
        lastMonth = month;
        return (
          <div key={monday.date} className="space-y-1">
            {heading && <p className="pt-3 pb-1 text-[13px] font-semibold text-ink capitalize">{heading}</p>}
            <div className="grid grid-cols-7 gap-1">
              {week.map((d) => {
                const on = selected.has(d.date);
                return (
                  <button
                    key={d.date}
                    type="button"
                    disabled={d.disabled}
                    aria-pressed={on}
                    aria-label={`${dayLabel(d.date, locale)} : ${d.label}`}
                    onClick={() => onPick(d.date)}
                    className={`min-h-[44px] rounded-lg border text-[14px] font-medium transition-colors ${
                      on
                        ? "bg-boost-olive border-boost-olive text-white"
                        : d.disabled
                          ? "bg-paper border-transparent text-ink-faint/60"
                          : d.hint
                            ? "bg-boost-cream border-boost-olive/30 text-ink hover:border-boost-olive"
                            : "bg-white border-paper-border text-ink hover:bg-paper-subtle"
                    } ${d.struck ? "line-through" : ""}`}
                  >
                    {Number(d.date.slice(8, 10))}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
