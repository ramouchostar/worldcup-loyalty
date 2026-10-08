import Link from "next/link";
import { Check, Lock } from "lucide-react";
import { ProgressRing } from "@/components/admin/ui";
import { addDays } from "@/lib/console-journey";
import { BASELINE_DAYS, MACHINE_CONTACTS, MACHINE_TICKETS, type GrowthView } from "@/lib/growth-game";
import { GrowthChiffreCard } from "./GrowthChiffreCard";

// Le grand chiffre de l'accueil simple — le jeu de la croissance (ADR 0081).
//
// Étape 1 « Lancer la machine » : deux anneaux (tickets, contacts sur 90 jours)
// et le chiffre d'affaires montré VERROUILLÉ, avec sa date estimée. Étape 2
// « Faire grandir le chiffre » : le palier de CA par jour, avec une bascule vers
// les tickets et contacts (GrowthChiffreCard, composant client).
//
// Charte Boosteats fixe (jetons boost-*), jamais celle de l'établissement
// (ADR 0054) ; tout est calculé dans lib/growth-game.ts (pur, testé).

const int = (n: number) => n.toLocaleString("fr-BE");

export function GrowthStepper({ stage }: { stage: GrowthView["stage"] }) {
  const steps = [
    { key: "machine", label: "Lancer la machine" },
    { key: "chiffre", label: "Faire grandir le chiffre" },
  ] as const;
  return (
    <ol className="flex items-center gap-1.5 text-[12.5px]" aria-label="Ton parcours">
      {steps.map((s, i) => {
        const state = stage === "chiffre" ? (i === 0 ? "done" : "current") : i === 0 ? "current" : "locked";
        return (
          <li key={s.key} className="flex items-center gap-1.5 min-w-0">
            {i > 0 && <span className="w-4 sm:w-6 h-px bg-paper-border shrink-0" aria-hidden="true" />}
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10.5px] font-bold ${
                state === "done" ? "bg-boost-olive text-white" : state === "current" ? "bg-boost-night text-white" : "bg-paper-subtle text-ink-faint"
              }`}
              aria-hidden="true"
            >
              {state === "done" ? <Check size={12} strokeWidth={3} /> : state === "locked" ? <Lock size={10} strokeWidth={2.4} /> : i + 1}
            </span>
            <span className={`truncate ${state === "current" ? "text-ink font-semibold" : "text-ink-muted"}`}>
              {s.label}
              <span className="sr-only">{state === "done" ? " — fait" : state === "current" ? " — en cours" : " — à venir"}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function GrowthHero({
  growth,
  base,
  today,
  salesIncomplete,
}: {
  growth: GrowthView;
  base: string;
  today: string;
  salesIncomplete: boolean;
}) {
  if (growth.stage === "chiffre") {
    return (
      <GrowthChiffreCard
        game={growth.game}
        tickets90={growth.tickets90}
        contacts90={growth.contacts90}
        ticketsWeek={growth.ticketsWeek}
        contactsWeek={growth.contactsWeek}
        notedDays={growth.notedDays}
        salesHref={`${base}/sales`}
        salesIncomplete={salesIncomplete}
      />
    );
  }

  const etaLabel =
    growth.eta === null
      ? null
      : new Date(`${addDays(today, growth.eta)}T12:00:00Z`).toLocaleDateString("fr-BE", { day: "numeric", month: "long", timeZone: "UTC" });

  return (
    <section className="bg-boost-night text-white rounded-2xl p-5 sm:p-6" aria-labelledby="etape-machine">
      <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-boost-light">Étape 1 · Lancer la machine</p>
      <h2 id="etape-machine" className="font-brand-display text-[22px] font-extrabold leading-tight mt-1">
        Deux jauges à remplir sur 90 jours
      </h2>

      <div className="grid grid-cols-2 gap-4 mt-5">
        <Gauge
          value={growth.tickets90}
          max={MACHINE_TICKETS}
          week={growth.ticketsWeek}
          label="Tickets scannés"
          a11y={`${growth.tickets90} tickets validés sur ${MACHINE_TICKETS}, 90 derniers jours`}
        />
        <Gauge
          value={growth.contacts90}
          max={MACHINE_CONTACTS}
          week={growth.contactsWeek}
          label="Contacts clients"
          a11y={`${growth.contacts90} nouveaux contacts sur ${MACHINE_CONTACTS}, 90 derniers jours`}
        />
      </div>

      <div className="flex items-start gap-3 mt-5 rounded-xl bg-white/[0.08] p-3.5">
        <Lock size={18} strokeWidth={2.2} className="text-boost-light shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-[14px] leading-snug">
          Ton <strong>objectif en chiffre d&apos;affaires</strong> s&apos;allume quand les deux jauges sont pleines.
          {etaLabel ? (
            <>
              {" "}
              À ton rythme : <strong className="text-boost-light">vers le {etaLabel}</strong>.
            </>
          ) : (
            " Elles avancent dès que tes clients photographient leurs tickets."
          )}
        </p>
      </div>

      <p className="text-[12.5px] text-white/75 mt-4 pt-4 border-t border-white/15">
        Chiffre d&apos;affaires noté : <strong className="text-white tabular-nums">{Math.min(growth.notedDays, BASELINE_DAYS)} jours sur {BASELINE_DAYS}</strong>.
        Il servira de point de départ.{" "}
        <Link href={`${base}/sales`} className="underline underline-offset-2 text-white hover:text-boost-light">
          Mes ventes
        </Link>
        {salesIncomplete && <span className="block mt-1 text-white/75">Lecture des ventes incomplète : le compte peut être en dessous du réel.</span>}
      </p>
    </section>
  );
}

function Gauge({ value, max, week, label, a11y }: { value: number; max: number; week: number; label: string; a11y: string }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <ProgressRing value={value} max={max} size={124} stroke={11} tone="boost" label={a11y}>
        <span className="font-brand-display text-[32px] font-extrabold leading-none tabular-nums">{int(value)}</span>
        <span className="text-[11px] text-white/70 mt-1">sur {max}</span>
      </ProgressRing>
      <span className="text-[14px] font-semibold">{label}</span>
      <span className="text-[12px] text-white/70 tabular-nums">{week > 0 ? `+${int(week)} cette semaine` : "Rien cette semaine"}</span>
    </div>
  );
}
