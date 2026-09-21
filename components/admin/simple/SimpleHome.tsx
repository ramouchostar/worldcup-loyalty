import type { ReactNode } from "react";
import Link from "next/link";
import {
  Check,
  ChevronRight,
  CircleCheck,
  Lightbulb,
  ListPlus,
  Lock,
  PartyPopper,
  Receipt,
  Star,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Card, PageHeader, ProgressBar, ProgressRing, SectionLabel, StatTile, StatusBadge } from "@/components/admin/ui";
import { GOAL_HELD_DAYS, pctLabel, type DayCell, type SimpleHomeView } from "@/lib/console-journey";

// Accueil de la vue simple (ADR 0064) — trois questions, dans cet ordre :
//   1. Est-ce que ça tourne aujourd'hui ?  → l'objectif du jour (ou, au
//      lancement, la liste de mise en place) ;
//   2. Qu'est-ce que je dois faire ?        → ce qui attend une décision, puis
//      LA prochaine étape de son parcours ;
//   3. Est-ce que ça vaut le coup ?         → le mois : ce que ses clients du
//      programme ont commandé face à ce que ses cadeaux ont coûté.
// Le reste (équipe en salle, prochain cap, parcours) est compact et vient après.
//
// Composant de présentation pur : tout est calculé dans lib/console-journey.ts
// (testé), la page ne fait que charger. Aucune couleur `brand-*` : l'accent de
// l'établissement résout en rouge chez Kraainem, et une console où la bonne
// nouvelle est rouge se lit comme une alarme (ADR 0054, ADR 0048 §7).

const eur = (n: number) => n.toLocaleString("fr-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const int = (n: number) => n.toLocaleString("fr-BE");
const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);

export function SimpleHome({
  view,
  dateLabel,
  top,
  bottom,
}: {
  view: SimpleHomeView;
  dateLabel: string;
  /** Bandeaux ponctuels (établissement en attente, siège rétrogradé…). */
  top?: ReactNode;
  /** Proposition d'installer la console, lien vers la vue pro. */
  bottom?: ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <PageHeader title="Aujourd'hui" subtitle={dateLabel} />
        <StageStepper stages={view.stages} />
      </div>

      {top}

      <div className="grid gap-5 lg:grid-cols-5 lg:items-start">
        {/* Colonne principale : les deux premières questions */}
        <div className="space-y-5 lg:col-span-3">
          {view.stage === "lancer" ? <LaunchCard view={view} /> : <GoalCard view={view} />}
          <TodoCard view={view} />
          {view.stage !== "lancer" && <NextStepCard view={view} />}
        </div>

        {/* Colonne de côté : la troisième question, puis le compact */}
        <div className="space-y-5 lg:col-span-2">
          <MonthCard view={view} />
          <StaffCard view={view} />
          <MilestoneCard view={view} />
          <JourneyCard view={view} />
        </div>
      </div>

      {bottom}
    </div>
  );
}

// ── Parcours : trois étapes, l'étape en cours, ce qui ouvre la suivante ────

function StageStepper({ stages }: { stages: SimpleHomeView["stages"] }) {
  return (
    <ol className="flex items-center gap-1.5 text-[12.5px]" aria-label="Ton parcours">
      {stages.map((s, i) => (
        <li key={s.key} className="flex items-center gap-1.5 min-w-0">
          {i > 0 && <span className="w-4 sm:w-6 h-px bg-paper-border shrink-0" aria-hidden="true" />}
          <span
            className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10.5px] font-bold ${
              s.state === "done" ? "bg-good text-white" : s.state === "current" ? "bg-ink text-white" : "bg-paper-subtle text-ink-faint"
            }`}
            aria-hidden="true"
          >
            {s.state === "done" ? <Check size={12} strokeWidth={3} /> : s.state === "locked" ? <Lock size={10} strokeWidth={2.4} /> : i + 1}
          </span>
          <span className={`truncate ${s.state === "current" ? "text-ink font-semibold" : "text-ink-muted"}`}>
            {s.label}
            <span className="sr-only">{s.state === "done" ? " — fait" : s.state === "current" ? " — en cours" : " — à venir"}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function JourneyCard({ view }: { view: SimpleHomeView }) {
  // Sur téléphone, la frise compacte du haut suffit ; l'ordinateur a la place
  // de dire ce qui ouvre chaque étape.
  return (
    <Card className="hidden lg:block">
      <SectionLabel tone="muted">Ton parcours</SectionLabel>
      <ol className="mt-3 space-y-3">
        {view.stages.map((s, i) => (
          <li key={s.key} className="flex items-start gap-3">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold mt-0.5 ${
                s.state === "done" ? "bg-good text-white" : s.state === "current" ? "bg-ink text-white" : "bg-paper-subtle text-ink-faint"
              }`}
              aria-hidden="true"
            >
              {s.state === "done" ? <Check size={13} strokeWidth={3} /> : s.state === "locked" ? <Lock size={11} strokeWidth={2.4} /> : i + 1}
            </span>
            <div className="min-w-0">
              <p className={`text-[13.5px] ${s.state === "current" ? "font-semibold text-ink" : "text-ink-body"}`}>{s.label}</p>
              <p className="text-[12px] text-ink-faint">
                {s.state === "done" ? "Fait" : s.state === "current" ? "En cours" : `S'ouvre à ${s.unlock}`}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

// ── Question 1 : est-ce que ça tourne aujourd'hui ? ────────────────────────

function GoalCard({ view }: { view: SimpleHomeView }) {
  const g = view.goal;
  const toLevelUp = Math.max(0, GOAL_HELD_DAYS - g.heldDays);
  return (
    <section className="bg-ink text-white rounded-xl p-5" aria-labelledby="objectif-du-jour">
      <div className="flex items-center gap-5">
        <ProgressRing value={g.today} max={g.target} label={`${g.today} ${plural(g.today, "ticket", "tickets")} sur un objectif de ${g.target}`}>
          <span className="font-display text-[34px] font-bold leading-none tabular-nums">{g.today}</span>
          <span className="text-[11px] text-white/60 mt-1">sur {g.target}</span>
        </ProgressRing>
        <div className="min-w-0">
          <p id="objectif-du-jour" className="font-mono text-[11px] tracking-[0.12em] uppercase text-white/60">
            Objectif du jour
          </p>
          <p className="font-display text-[20px] sm:text-[22px] font-bold leading-tight mt-1">
            {g.target} tickets photographiés
          </p>
          <p className="text-[13px] text-white/75 mt-1.5">
            {g.met ? (
              <>
                <PartyPopper size={14} strokeWidth={1.8} className="inline-block mr-1 -mt-0.5 text-good" aria-hidden="true" />
                Objectif atteint — chaque ticket en plus compte pour la suite.
              </>
            ) : (
              <>
                Encore {g.remaining} {plural(g.remaining, "ticket", "tickets")} pour l&apos;atteindre.
              </>
            )}
          </p>
        </div>
      </div>

      {/* Téléphone : les 7 derniers jours en pastilles */}
      <div className="mt-5 md:hidden">
        <WeekDots days={g.week} />
      </div>
      {/* Ordinateur : 14 jours en barres, avec la ligne de l'objectif */}
      <div className="mt-5 hidden md:block">
        <FortnightBars days={g.fortnight} goal={g.target} />
      </div>

      <p className="text-[12.5px] text-white/75 mt-4 pt-4 border-t border-white/15">
        {toLevelUp === 0 ? (
          <>
            <strong className="text-white">Palier tenu 5 jours sur 7.</strong>
            {g.nextLevel ? ` Demain, ton objectif passe à ${g.nextLevel} tickets.` : " Tu es au plus haut palier."}
          </>
        ) : (
          <>
            <strong className="text-white">
              {g.heldDays} {plural(g.heldDays, "jour", "jours")} sur {GOAL_HELD_DAYS}
            </strong>{" "}
            à {g.target} tickets ou plus cette semaine
            {g.nextLevel ? ` — encore ${toLevelUp} pour passer à ${g.nextLevel} par jour.` : "."}
          </>
        )}
      </p>
    </section>
  );
}

function WeekDots({ days }: { days: DayCell[] }) {
  return (
    <ol className="grid grid-cols-7 gap-1.5" aria-label="Tickets des 7 derniers jours">
      {days.map((d) => (
        <li key={d.day} className="flex flex-col items-center gap-1.5">
          <span
            className={`w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-bold tabular-nums ${
              d.met ? "bg-good text-white" : "bg-white/10 text-white/80"
            } ${d.isToday ? "ring-2 ring-white ring-offset-2 ring-offset-ink" : ""}`}
          >
            {d.met ? <Check size={16} strokeWidth={3} aria-hidden="true" /> : d.count}
            <span className="sr-only">
              {`${d.weekday} : ${d.count} ${plural(d.count, "ticket", "tickets")}${d.met ? ", objectif atteint" : ""}`}
            </span>
          </span>
          <span className={`text-[11px] ${d.isToday ? "text-white font-semibold" : "text-white/60"}`} aria-hidden="true">
            {d.letter}
          </span>
        </li>
      ))}
    </ol>
  );
}

function FortnightBars({ days, goal }: { days: DayCell[]; goal: number }) {
  const top = Math.max(goal, ...days.map((d) => d.count), 1);
  const goalPct = (goal / top) * 100;
  return (
    <div>
      {/* Légende au-dessus du graphique : posée sur la ligne pointillée, elle
          chevauchait le chiffre de la barre voisine. */}
      <div className="flex items-center justify-between text-[11px] text-white/60 mb-2" aria-hidden="true">
        <span>14 derniers jours</span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 border-t border-dashed border-white/60" />
          objectif d&apos;aujourd&apos;hui : {goal}
        </span>
      </div>
      <div className="relative h-24" role="img" aria-label={`Tickets des 14 derniers jours, objectif ${goal} par jour`}>
        <div
          className="absolute inset-x-0 border-t border-dashed border-white/40"
          style={{ bottom: `${goalPct}%` }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 flex items-end gap-1.5">
          {days.map((d) => (
            <div key={d.day} className="flex-1 h-full flex flex-col justify-end items-center">
              <span className="text-[10.5px] text-white/70 tabular-nums mb-1">{d.count > 0 ? d.count : ""}</span>
              <div
                className={`w-full rounded-t-[3px] ${d.met ? "bg-good" : "bg-white/25"} ${d.isToday ? "outline outline-2 outline-white outline-offset-1" : ""}`}
                style={{ height: `${d.count > 0 ? Math.max(4, (d.count / top) * 100) : 2}%` }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-1.5 mt-1.5" aria-hidden="true">
        {days.map((d) => (
          <span key={d.day} className={`flex-1 text-center text-[10.5px] ${d.isToday ? "text-white font-semibold" : "text-white/50"}`}>
            {d.letter}
          </span>
        ))}
      </div>
    </div>
  );
}

function LaunchCard({ view }: { view: SimpleHomeView }) {
  const { items, done, total } = view.checklist;
  const nextKey = items.find((i) => !i.done)?.key;
  return (
    <Card padding="p-0" className="overflow-hidden">
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-display text-[20px] font-bold tracking-[-0.01em] text-ink">Lance ton programme</p>
          <span className="text-[13px] font-semibold text-ink-muted tabular-nums shrink-0">
            {done} / {total}
          </span>
        </div>
        <p className="text-[13px] text-ink-muted mt-1">Cinq gestes, et tes clients commencent à photographier leurs tickets.</p>
        <ProgressBar className="mt-3" value={done} max={total} tone={done === total ? "good" : "neutral"} label="Étapes de lancement faites" />
      </div>
      {items.map((it) => {
        const isNext = it.key === nextKey;
        return (
          <Link
            key={it.key}
            href={it.href}
            className={`flex items-start gap-3.5 px-5 py-3.5 border-t border-paper-border hover:bg-paper transition-colors ${isNext ? "bg-paper" : ""}`}
          >
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                it.done ? "bg-good text-white" : isNext ? "border-2 border-ink" : "border-2 border-paper-border"
              }`}
              aria-hidden="true"
            >
              {it.done && <Check size={14} strokeWidth={3} />}
            </span>
            <div className="flex-1 min-w-0">
              <p className={`text-[14.5px] ${it.done ? "text-ink-muted" : "font-semibold text-ink"}`}>
                {it.title}
                <span className="sr-only">{it.done ? " — fait" : " — à faire"}</span>
              </p>
              {isNext && <p className="text-[12.5px] text-ink-muted mt-0.5">{it.hint}</p>}
              {it.progress && !it.done && (
                <div className="flex items-center gap-2.5 mt-2">
                  <ProgressBar value={it.progress.value} max={it.progress.target} label="Tickets validés" />
                  <span className="text-[12px] font-semibold text-ink-muted tabular-nums shrink-0">
                    {it.progress.value}/{it.progress.target}
                  </span>
                </div>
              )}
            </div>
            <ChevronRight size={15} className="text-ink-faint shrink-0 mt-1" aria-hidden="true" />
          </Link>
        );
      })}
    </Card>
  );
}

// ── Question 2 : qu'est-ce que je dois faire ? ─────────────────────────────

const TODO_ICONS: Record<string, LucideIcon> = { flagged: Receipt, pending: Receipt, claims: Star, catalog: ListPlus };

function TodoCard({ view }: { view: SimpleHomeView }) {
  if (view.todo.length === 0) {
    return (
      <div className="flex items-center gap-3 bg-white border border-paper-border rounded-xl px-5 py-3.5">
        <span className="w-8 h-8 rounded-lg bg-good/10 text-good flex items-center justify-center shrink-0" aria-hidden="true">
          <CircleCheck size={17} strokeWidth={1.8} />
        </span>
        <p className="text-[13.5px] text-ink">
          <span className="font-semibold">Rien à vérifier.</span> <span className="text-ink-muted">Tes tickets sont à jour.</span>
        </p>
      </div>
    );
  }
  return (
    <Card padding="p-0">
      <div className="px-5 pt-4 pb-3">
        <SectionLabel tone="muted">À faire</SectionLabel>
      </div>
      {view.todo.map((t) => {
        const Icon = TODO_ICONS[t.key] ?? Receipt;
        return (
          <Link key={t.key} href={t.href} className="flex items-center gap-3.5 px-5 py-3.5 border-t border-paper-border hover:bg-paper transition-colors">
            <span className="w-9 h-9 rounded-[9px] bg-warn/10 text-warn flex items-center justify-center shrink-0" aria-hidden="true">
              <Icon size={18} strokeWidth={1.7} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[14.5px] font-semibold text-ink">{t.title}</p>
              <p className="text-[12.5px] text-ink-muted mt-0.5">{t.hint}</p>
            </div>
            <StatusBadge tone="warn" solid className="shrink-0">
              {t.count}
            </StatusBadge>
            <ChevronRight size={15} className="text-ink-faint shrink-0" aria-hidden="true" />
          </Link>
        );
      })}
    </Card>
  );
}

function NextStepCard({ view }: { view: SimpleHomeView }) {
  const n = view.next;
  if (n.kind === "checklist") return null;

  if (n.kind === "staff") {
    return (
      <Card>
        <SectionLabel tone="muted">Ta prochaine étape</SectionLabel>
        <div className="flex items-start gap-3.5 mt-3">
          <span className="w-10 h-10 rounded-xl bg-paper-subtle text-ink flex items-center justify-center shrink-0" aria-hidden="true">
            <Users size={20} strokeWidth={1.7} />
          </span>
          <div className="min-w-0">
            <p className="font-display text-[17px] font-bold text-ink">Donne un QR à chaque personne en salle</p>
            <p className="text-[13px] text-ink-muted mt-1">
              C&apos;est la première source d&apos;inscriptions qu&apos;on observe : chacun montre son badge depuis son
              téléphone, et tu vois qui fait inscrire le plus de clients.
            </p>
          </div>
        </div>
        <PrimaryLink href={n.href}>Créer les QR de l&apos;équipe</PrimaryLink>
      </Card>
    );
  }

  if (n.kind === "growth") {
    return (
      <Card>
        <SectionLabel tone="muted">Ta prochaine étape</SectionLabel>
        <p className="font-display text-[17px] font-bold text-ink mt-2">Débloque tes idées pour faire grandir ton chiffre</p>
        <p className="text-[13px] text-ink-muted mt-1">
          Avec {n.target} tickets sur 90 jours, on repère tes jours calmes, tes plats phares et tes heures creuses — et on
          te propose des promos qui restent rentables.
        </p>
        <div className="flex items-center gap-3 mt-3">
          <ProgressBar value={n.value} max={n.target} label="Tickets validés sur 90 jours" />
          <span className="text-[13px] font-semibold text-ink tabular-nums shrink-0">
            {n.value} / {n.target}
          </span>
        </div>
        <p className="text-[12.5px] text-ink-muted mt-2">
          {n.eta === null
            ? "Chaque ticket photographié t'en rapproche."
            : `Environ ${n.eta} ${plural(n.eta, "jour", "jours")} à ton rythme actuel.`}
        </p>
        <div className="flex items-start gap-3 mt-4 bg-paper border border-paper-border rounded-lg p-3.5">
          <Lightbulb size={17} strokeWidth={1.7} className="text-ink-muted shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-[13px] text-ink-body">
            <span className="font-semibold text-ink">Le geste du jour — </span>
            {n.tip}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <SectionLabel tone="muted">Ta prochaine étape</SectionLabel>
      <div className="flex items-start gap-3.5 mt-3">
        <span className="w-10 h-10 rounded-xl bg-good/10 text-good flex items-center justify-center shrink-0" aria-hidden="true">
          <Lightbulb size={20} strokeWidth={1.7} />
        </span>
        <div className="min-w-0">
          <p className="font-display text-[17px] font-bold text-ink">Tes idées de croissance sont prêtes</p>
          <p className="text-[13px] text-ink-muted mt-1">
            Des promos pour tes jours calmes, des combos, des offres de fin de mois — calculées sur tes tickets, avec le
            message à envoyer à tes clients.
          </p>
        </div>
      </div>
      <PrimaryLink href={n.href}>Voir mes idées</PrimaryLink>
    </Card>
  );
}

function PrimaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="mt-4 inline-flex items-center justify-center gap-1.5 w-full sm:w-auto min-h-[44px] px-5 rounded-lg bg-ink text-white text-[14px] font-semibold hover:bg-ink-body transition-colors"
    >
      {children}
      <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
    </Link>
  );
}

// ── Question 3 : est-ce que ça vaut le coup ? ──────────────────────────────

function MonthCard({ view }: { view: SimpleHomeView }) {
  const m = view.month;
  return (
    <Card>
      <SectionLabel tone="muted">Ce mois-ci</SectionLabel>
      {m ? (
        <>
          <div className="grid grid-cols-2 gap-4 mt-3">
            <StatTile value={eur(m.revenue)} label="commandes de tes clients du programme" />
            <StatTile value={eur(m.rewardsCost)} label="de cadeaux offerts" />
          </div>
          {m.perEuro !== null && (
            <p className="text-[13px] text-ink mt-3">
              Soit <strong>1 € de cadeau pour {int(m.perEuro)} € de commandes.</strong>
            </p>
          )}
        </>
      ) : (
        <p className="text-[13px] text-ink-muted mt-2">
          Dès le premier ticket validé du mois, tu verras ici ce que tes clients du programme commandent et ce que tes
          cadeaux te coûtent.
        </p>
      )}
      {/* La mission, là où le coût s'affiche : un cadeau se lit comme un
          investissement mesuré, pas comme une perte (demande du porteur). */}
      <p className="text-[12px] text-ink-faint mt-3 pt-3 border-t border-paper-border">
        Notre rôle : faire grandir ton chiffre d&apos;affaires et tes commandes directes. Tes cadeaux sont un investissement
        plafonné à {pctLabel(view.budgetPct)} de ce que tes clients dépensent — et on mesure tout.
      </p>
    </Card>
  );
}

// ── Le compact : équipe en salle, prochain cap ─────────────────────────────

function StaffCard({ view }: { view: SimpleHomeView }) {
  if (!view.hasStaffCodes) return null;
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <SectionLabel tone="muted">Équipe en salle · 30 jours</SectionLabel>
      </div>
      {view.staffTop.length > 0 ? (
        <ol className="mt-3 space-y-2.5">
          {view.staffTop.map((s, i) => (
            <li key={s.label} className="flex items-center gap-3">
              <span
                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[12px] font-bold ${
                  i === 0 ? "bg-ink text-white" : "bg-paper-subtle text-ink-body"
                }`}
                aria-hidden="true"
              >
                {i === 0 ? <Trophy size={14} strokeWidth={1.8} /> : i + 1}
              </span>
              <span className="flex-1 text-[14px] font-semibold text-ink truncate">{s.label}</span>
              <span className="text-[12.5px] text-ink-muted tabular-nums shrink-0">
                {s.signups30d} {plural(s.signups30d, "inscription", "inscriptions")}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-[13px] text-ink-muted mt-2">Aucune inscription par un QR de l&apos;équipe ces 30 derniers jours.</p>
      )}
    </Card>
  );
}

const MILESTONE_UNIT: Record<string, (n: number) => string> = {
  tickets: (n) => `${int(n)} tickets validés`,
  members: (n) => `${int(n)} clients inscrits`,
  revenue: (n) => `${eur(n)} de commandes`,
};

function MilestoneCard({ view }: { view: SimpleHomeView }) {
  const m = view.milestone;
  if (!m) return null;
  const unit = MILESTONE_UNIT[m.kind];
  if (m.crossed !== null) {
    return (
      <div className="flex items-start gap-3 bg-good/10 border border-good/30 rounded-xl px-5 py-4">
        <PartyPopper size={20} strokeWidth={1.7} className="text-good shrink-0 mt-0.5" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-ink">Cap franchi cette semaine : {unit(m.crossed)}</p>
          {m.next !== null && <p className="text-[12.5px] text-ink-muted mt-0.5">Prochain cap : {unit(m.next)}.</p>}
        </div>
      </div>
    );
  }
  if (m.next === null) return null;
  return (
    <Card>
      <SectionLabel tone="muted">Prochain cap</SectionLabel>
      <p className="text-[14px] font-semibold text-ink mt-2">{unit(m.next)}</p>
      <div className="flex items-center gap-3 mt-2">
        <ProgressBar value={m.value} max={m.next} label={`Vers ${unit(m.next)}`} />
        <span className="text-[12.5px] font-semibold text-ink-muted tabular-nums shrink-0">
          {int(m.value)}/{int(m.next)}
        </span>
      </div>
    </Card>
  );
}
