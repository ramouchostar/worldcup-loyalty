"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { ProgressBar } from "@/components/admin/ui";
import { BASELINE_DAYS, HELD_WEEKS, WINDOW_WEEKS, type GrowthView } from "@/lib/growth-game";

// Étape 2 du jeu de la croissance (ADR 0081) : le palier de chiffre
// d'affaires par jour, et une bascule vers les tickets et contacts — le
// restaurateur garde les deux sous les yeux sans deux cartes l'une sur l'autre.
// Composant client pour la seule bascule ; tout est calculé côté serveur.

type Game = Extract<GrowthView, { stage: "chiffre" }>["game"];

const eur = (n: number) => n.toLocaleString("fr-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const int = (n: number) => n.toLocaleString("fr-BE");
const weekLabel = (monday: string) =>
  new Date(`${monday}T12:00:00Z`).toLocaleDateString("fr-BE", { day: "numeric", month: "short", timeZone: "UTC" });

export function GrowthChiffreCard({
  game,
  tickets90,
  contacts90,
  ticketsWeek,
  contactsWeek,
  notedDays,
  salesHref,
  salesIncomplete,
}: {
  game: Game;
  tickets90: number;
  contacts90: number;
  ticketsWeek: number;
  contactsWeek: number;
  notedDays: number;
  salesHref: string;
  salesIncomplete: boolean;
}) {
  const [tab, setTab] = useState<"ca" | "tickets">("ca");
  return (
    <section className="space-y-3" aria-label="Faire grandir le chiffre">
      <div className="grid grid-cols-2 gap-1 bg-paper-subtle rounded-xl p-1" role="group" aria-label="Ce que tu regardes">
        {(
          [
            ["ca", "Chiffre d'affaires"],
            ["tickets", "Tickets & contacts"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
            className={`min-h-[40px] rounded-lg text-[14px] font-semibold transition-colors ${
              tab === key ? "bg-white text-ink shadow-sm" : "text-ink-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="bg-boost-night text-white rounded-2xl p-5 sm:p-6">
        {tab === "tickets" ? (
          <TicketsPanel tickets90={tickets90} contacts90={contacts90} ticketsWeek={ticketsWeek} contactsWeek={contactsWeek} />
        ) : game === null ? (
          <NoBaseline notedDays={notedDays} salesHref={salesHref} />
        ) : (
          <PalierPanel game={game} />
        )}
        {salesIncomplete && tab === "ca" && (
          <p className="text-[12px] text-white/75 mt-3">Lecture des ventes incomplète : les chiffres peuvent être faux, on vérifie.</p>
        )}
      </div>
    </section>
  );
}

function PalierPanel({ game }: { game: NonNullable<Game> }) {
  const g = game;
  if (g.capReached || g.target === null) {
    return (
      <div>
        <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-boost-light">Niveau {g.level} · cap atteint</p>
        <p className="font-brand-display text-[28px] font-extrabold leading-tight mt-1">Tu tiens {eur(g.cap)} par jour</p>
        <p className="text-[14px] text-white/80 mt-2">
          Parti de {eur(g.depart)} : c&apos;est {eur(g.cap - g.depart)} de plus chaque jour. On fixe un nouveau cap ensemble.
        </p>
      </div>
    );
  }
  const prev = g.level === 1 ? g.depart : g.steps[g.level - 2];
  const toGo = HELD_WEEKS - g.heldWeeks;
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-white/70">Niveau {g.level} · ton palier</p>
        <p className="font-brand-display text-[20px] font-extrabold text-boost-light tabular-nums">{eur(g.target)} / jour</p>
      </div>

      {g.current ? (
        <>
          <p className="font-brand-display text-[52px] font-extrabold leading-none tracking-[-0.02em] tabular-nums mt-3">{eur(g.current.avg)}</p>
          <p className="text-[13px] text-white/70 mt-1">
            {g.current.thisWeek ? "ta moyenne par jour cette semaine" : "ta moyenne par jour, dernière semaine notée"} ·{" "}
            {g.current.days} {g.current.days > 1 ? "jours notés" : "jour noté"}
          </p>
        </>
      ) : (
        <p className="text-[14px] text-white/80 mt-3">Note ton chiffre d&apos;affaires cette semaine pour voir où tu en es.</p>
      )}

      <div className="mt-4">
        <ProgressBar
          value={Math.max(0, (g.current?.avg ?? prev) - prev)}
          max={g.target - prev}
          tone="boost"
          surface="dark"
          label={`Vers le palier de ${eur(g.target)} par jour`}
        />
        <div className="flex justify-between text-[12px] text-white/70 mt-1.5 tabular-nums">
          <span>{eur(prev)}</span>
          <span>{eur(g.target)}</span>
        </div>
      </div>

      {g.gap !== null && (
        <p className="mt-4 rounded-xl bg-white/[0.08] px-3.5 py-3 font-brand-display text-[17px] font-extrabold text-boost-light">
          {g.gap === 0 ? "Palier tenu cette semaine, garde le rythme" : `Plus que ${eur(g.gap)} par jour`}
        </p>
      )}

      <div className="mt-4 pt-4 border-t border-white/15">
        <p className="text-[13px] text-white/80">
          Pour passer niveau {g.level + 1} : {HELD_WEEKS} semaines sur les {WINDOW_WEEKS} dernières au-dessus de {eur(g.target)}.{" "}
          <strong className="text-white">{toGo > 0 ? `Encore ${toGo}.` : "C'est fait."}</strong>
        </p>
        {g.recent.length > 0 && (
          <ol className="flex gap-2 mt-3" aria-label="Les semaines qui comptent">
            {g.recent.map((w) => (
              <li
                key={w.monday}
                className={`flex-1 rounded-lg px-2 py-2 text-center ${w.held ? "bg-boost-olive text-white" : "bg-white/[0.08] text-white/80"}`}
              >
                <span className="flex items-center justify-center gap-1 text-[11px]">
                  {w.held && <Check size={12} strokeWidth={3} aria-hidden="true" />}
                  sem. du {weekLabel(w.monday)}
                </span>
                <span className="block font-brand-display text-[15px] font-extrabold tabular-nums">{eur(w.avg)}</span>
                <span className="sr-only">{w.held ? "palier tenu" : "palier pas tenu"}</span>
              </li>
            ))}
          </ol>
        )}
        <p className="text-[12px] text-white/60 mt-3">
          Départ {eur(g.depart)} (moyenne de tes {BASELINE_DAYS} premiers jours notés) · cap {eur(g.cap)}
        </p>
      </div>
    </div>
  );
}

function NoBaseline({ notedDays, salesHref }: { notedDays: number; salesHref: string }) {
  return (
    <div>
      <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-boost-light">Étape 2 · Faire grandir le chiffre</p>
      <p className="font-brand-display text-[24px] font-extrabold leading-tight mt-1">On calcule ton point de départ</p>
      <div className="flex items-center gap-3 mt-4">
        <ProgressBar value={notedDays} max={BASELINE_DAYS} tone="boost" surface="dark" label="Jours de chiffre d'affaires notés" />
        <span className="text-[13px] font-semibold tabular-nums shrink-0">
          {Math.min(notedDays, BASELINE_DAYS)} / {BASELINE_DAYS} jours
        </span>
      </div>
      <p className="text-[14px] text-white/80 mt-3">
        Encore {Math.max(0, BASELINE_DAYS - notedDays)} jours de chiffre d&apos;affaires notés et ton premier palier s&apos;allume.{" "}
        <Link href={salesHref} className="underline underline-offset-2 text-white hover:text-boost-light">
          Mes ventes
        </Link>
      </p>
    </div>
  );
}

function TicketsPanel({ tickets90, contacts90, ticketsWeek, contactsWeek }: { tickets90: number; contacts90: number; ticketsWeek: number; contactsWeek: number }) {
  return (
    <div>
      <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-white/70">90 derniers jours</p>
      <div className="grid grid-cols-2 gap-4 mt-3">
        {(
          [
            [tickets90, "tickets scannés", ticketsWeek],
            [contacts90, "contacts clients", contactsWeek],
          ] as const
        ).map(([value, label, week]) => (
          <div key={label}>
            <p className="font-brand-display text-[44px] font-extrabold leading-none tabular-nums">{int(value)}</p>
            <p className="text-[13px] text-white/75 mt-1">{label}</p>
            <p className="text-[12px] font-semibold text-boost-light mt-0.5 tabular-nums">{week > 0 ? `+${int(week)} cette semaine` : "Rien cette semaine"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
