import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarX, CircleCheck, TrendingDown, TrendingUp } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase";
import { isEstablishmentAdmin } from "@/lib/admin-guard";
import { todayInBrussels } from "@/lib/qr-funnel";
import { loadRevenueTracker } from "@/lib/revenue-tracker-data";
import { getDayChannels } from "@/lib/daily-revenue";
import { dayLabel, weekdayName, type DailyEntry } from "@/lib/daily-revenue-model";
import { dayFeedback, isEditableDay, missingDays, shortDayLabel, type DayFeedback } from "@/lib/daily-revenue-entry";
import { pendingServicesFor } from "@/lib/service-requests";
import { Card, EmptyState, PageHeader, SectionLabel } from "@/components/admin/ui";
import { CaEntryForm } from "@/components/admin/ca/CaEntryForm";
import { CaisseRequestButton } from "@/components/admin/ca/CaisseRequestButton";

// ADR 0087 — la saisie du CA du jour par le restaurateur. Hors du menu : on y
// arrive par un rappel (notification, e-mail) ou par « À faire » de l'accueil.
// Jour déjà noté → ce que ça donne ; `?modifier=1` → le formulaire pré-rempli.

const eur = (n: number) => `${Math.round(n).toLocaleString("fr-BE")} €`;
const eur2 = (n: number) => `${n.toLocaleString("fr-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const signed = (p: number) => `${p > 0 ? "+" : p < 0 ? "−" : "±"}${Math.abs(p)} %`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default async function CaDayPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantId: string; jour: string }>;
  searchParams: Promise<{ ok?: string; modifier?: string; erreur?: string }>;
}) {
  const { restaurantId, jour } = await params;
  const { ok, modifier, erreur } = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?reason=login-required");
  if (!(await isEstablishmentAdmin(user.id, restaurantId))) redirect("/join");

  const base = `/admin/${restaurantId}`;
  const today = todayInBrussels();

  if (!isEditableDay(jour, today)) {
    return (
      <div className="max-w-xl mx-auto space-y-5">
        <PageHeader title="CA du jour" />
        <EmptyState icon={CalendarX} title="Ce jour ne se saisit plus ici">
          On note les 14 derniers jours, aujourd&apos;hui compris. Pour un jour plus ancien, écris-nous : on le corrige pour toi.
        </EmptyState>
        <Link href={base} className="block text-center text-[13.5px] text-ink-muted underline underline-offset-4">Retour à l&apos;accueil</Link>
      </div>
    );
  }

  const [{ days, program }, channels, pending] = await Promise.all([
    loadRevenueTracker(restaurantId, today),
    getDayChannels(restaurantId, jour),
    pendingServicesFor(restaurantId),
  ]);
  const current = days.find((d) => d.day === jour) ?? null;
  const noted = current !== null;
  const editing = !noted || modifier === "1";

  // Les jours connus, au format de la lecture comparée (ADR 0078) : saisie du jour, puis ventes importées.
  const entries: DailyEntry[] = days.map((d) => ({
    sales_day: d.day,
    outcome: d.closed ? "ferme" : "saisi",
    amount: d.closed ? null : d.amount,
    tickets: d.tickets,
    asked_at: null,
    replied_at: null,
    note: null,
  }));
  const stillMissing = missingDays(new Set(days.map((d) => d.day)), today).filter((d) => d !== jour);
  const name = weekdayName(jour);
  const title = cap(dayLabel(jour));

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <PageHeader title={title} subtitle={editing ? "Chiffre d'affaires TVA comprise, toute la journée." : "CA du jour"} />

      {erreur && (
        <p role="alert" className="bg-danger/10 border border-danger/30 text-danger rounded-xl px-4 py-3 text-[13.5px]">{erreur}</p>
      )}

      {editing ? (
        <>
          <p className="bg-paper-subtle border border-paper-border rounded-xl px-4 py-3 text-[13.5px] text-ink-body">
            Ce chiffre nourrit ta comparaison semaine après semaine et, après 4 semaines notées, tes prévisions.
          </p>
          <CaEntryForm
            restaurantId={restaurantId}
            day={jour}
            dayName={name}
            initial={{ amount: current?.amount ?? null, tickets: current?.tickets ?? null, channels }}
          />
        </>
      ) : current?.closed ? (
        <Card>
          <p className="text-[14.5px] text-ink">
            <span className="font-semibold">Noté : fermé ce jour-là.</span>{" "}
            <span className="text-ink-muted">Il ne compte pas dans tes moyennes.</span>
          </p>
          <Link href={`?modifier=1`} className="inline-block mt-3 text-[13.5px] font-semibold text-ink underline underline-offset-4">Modifier</Link>
        </Card>
      ) : (
        <Feedback f={dayFeedback(entries, jour, current?.amount ?? 0, current?.tickets ?? null, program[jour] ?? { amount: 0, tickets: 0 })} justSaved={ok === "1"} name={name} />
      )}

      {!editing && stillMissing.length > 0 && (
        <Card padding="p-0">
          <div className="px-5 pt-4 pb-2">
            <SectionLabel tone="muted">Encore à saisir</SectionLabel>
          </div>
          {stillMissing.map((d) => (
            <div key={d} className="flex items-center justify-between gap-3 px-5 py-3 border-t border-paper-border">
              <span className="text-[14px] text-ink">CA de {shortDayLabel(d)}</span>
              <Link href={`${base}/ca/${d}`} className="min-h-[40px] inline-flex items-center px-4 rounded-lg bg-ink text-white text-[13px] font-semibold hover:bg-ink-body">
                Saisir
              </Link>
            </div>
          ))}
        </Card>
      )}

      <Card>
        <p className="text-[13.5px] text-ink-body mb-3">
          Ta caisse peut nous envoyer ce chiffre toute seule ? Dis-le nous : on te contacte pour voir comment la connecter.
        </p>
        <CaisseRequestButton restaurantId={restaurantId} alreadyPending={pending.includes("caisse")} />
      </Card>

      <Link href={base} className="block text-center text-[13.5px] text-ink-muted underline underline-offset-4">Retour à l&apos;accueil</Link>
    </div>
  );
}

function Delta({ pct, children }: { pct: number; children: React.ReactNode }) {
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold ${up ? "bg-good/10 text-good" : "bg-warn/10 text-warn"}`}>
      <Icon size={14} strokeWidth={2} aria-hidden="true" />
      {children}
    </span>
  );
}

function Feedback({ f, justSaved, name }: { f: DayFeedback; justSaved: boolean; name: string }) {
  const p = f.program;
  const unusual: string[] = [];
  if (f.sameDays?.unusual) unusual.push(`${cap(name)} à ${signed(f.sameDays.pct)} par rapport à ${f.sameDays.n > 1 ? `tes ${f.sameDays.n} derniers ${name}s` : `${name} dernier`}.`);
  if (f.week.unusual && f.week.pct !== null) unusual.push(`Semaine à ${signed(f.week.pct)} par rapport à la même période de la semaine dernière.`);

  return (
    <div className="space-y-4">
      <Card>
        {justSaved && (
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-good mb-2">
            <CircleCheck size={15} strokeWidth={2} aria-hidden="true" /> Noté, merci !
          </p>
        )}
        <p className="font-display text-[34px] font-extrabold tracking-[-0.02em] text-ink tabular-nums">{eur(f.amount)}</p>
        <div className="mt-2">
          {f.sameDays ? (
            <Delta pct={f.sameDays.pct}>
              {signed(f.sameDays.pct)} vs {f.sameDays.n > 1 ? `tes ${f.sameDays.n} derniers ${name}s (${eur(f.sameDays.avg)})` : `${name} dernier (${eur(f.sameDays.avg)})`}
            </Delta>
          ) : (
            <p className="text-[13px] text-ink-muted">Dès {name} prochain, tu verras si c&apos;est mieux ou moins bien.</p>
          )}
        </div>
        {f.averageTicket !== null && <p className="text-[13px] text-ink-muted mt-2">Ticket moyen : {eur2(f.averageTicket)} ({p.orders} commandes)</p>}
        <Link href="?modifier=1" className="inline-block mt-3 text-[13px] text-ink-muted underline underline-offset-4">Modifier</Link>
      </Card>

      <Card>
        <h2 className="font-display text-[15px] font-bold text-ink mb-2">Ta semaine</h2>
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 text-[14px] tabular-nums">
          <dt className="text-ink-body">Depuis lundi ({f.week.days} jour{f.week.days > 1 ? "s" : ""} noté{f.week.days > 1 ? "s" : ""})</dt>
          <dd className="text-right font-semibold text-ink">{eur(f.week.sum)}</dd>
          {f.week.prevSum !== null && (
            <>
              <dt className="text-ink-body">Même période, semaine dernière</dt>
              <dd className="text-right font-semibold text-ink">{eur(f.week.prevSum)}</dd>
            </>
          )}
        </dl>
        <div className="mt-2">
          {f.week.pct !== null ? (
            <Delta pct={f.week.pct}>{signed(f.week.pct)} sur la semaine</Delta>
          ) : (
            <p className="text-[12.5px] text-ink-muted">La comparaison s&apos;affiche quand les deux semaines sont notées en entier.</p>
          )}
        </div>
      </Card>

      <Card>
        <h2 className="font-display text-[15px] font-bold text-ink mb-2">Ton programme fidélité ce jour-là</h2>
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 text-[14px] tabular-nums">
          <dt className="text-ink-body">Tickets scannés</dt>
          <dd className="text-right font-semibold text-ink">{p.tickets}</dd>
          <dt className="text-ink-body">CA venu du programme</dt>
          <dd className="text-right font-semibold text-ink">{eur(p.amount)}</dd>
          <dt className="text-ink-body">Taux de pénétration</dt>
          <dd className="text-right font-semibold text-ink">{p.penetrationPct.toLocaleString("fr-BE")} % du CA</dd>
          {p.orderSharePct !== null && (
            <>
              <dt className="text-ink-body">Part des commandes</dt>
              <dd className="text-right font-semibold text-ink">{p.tickets} sur {p.orders} ({p.orderSharePct} %)</dd>
            </>
          )}
        </dl>
        <p className="text-[12.5px] text-ink-muted mt-2">
          {p.tickets === 0
            ? "Aucun ticket scanné ce jour-là. Rappelle à ton équipe de proposer le programme à chaque client qui paie."
            : "Chaque client qui scanne est un client que tu peux faire revenir : ton équipe peut viser plus haut."}
        </p>
      </Card>

      {unusual.length > 0 && (
        <Card>
          <h2 className="font-display text-[15px] font-bold text-ink mb-2">Ce qui sort de l&apos;ordinaire</h2>
          <ul className="space-y-1.5">
            {unusual.map((u) => (
              <li key={u} className="border-l-[3px] border-warn pl-3 text-[13.5px] text-ink-body">{u}</li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
