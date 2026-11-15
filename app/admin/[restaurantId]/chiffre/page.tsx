import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { isEstablishmentAdmin } from "@/lib/admin-guard";
import { getEntitlement } from "@/lib/entitlements";
import { todayInBrussels } from "@/lib/qr-funnel";
import { addDays } from "@/lib/console-journey";
import { belgianPublicHolidays } from "@/lib/forecast";
import { forecastFrom, loadForecastInputs } from "@/lib/forecast-data";
import { parseStatsPeriod, statsPeriod } from "@/lib/stats-page";
import {
  caBars,
  caSummary,
  channelMix,
  chloeTips,
  hourGrid,
  lastReadDay,
  longDay,
  monthActual,
  monthName,
  monthStart,
  projectMonth,
  projectionSentence,
  readWindow,
  recentOrders,
  weekType,
  type ForecastDayLite,
} from "@/lib/revenue-page";
import { loadCaDays, loadCaSource, loadChannels, loadHourly } from "@/lib/revenue-page-data";
import { Card, PageHeader } from "@/components/admin/ui";
import { RequestPlanButton } from "@/components/admin/Paywall";
import { StatsPeriodTabs } from "@/components/admin/simple/StatsPeriodTabs";
import { ForecastSection } from "@/components/admin/ca/ForecastSection";
import {
  ChannelsSection,
  DayBars,
  DayList,
  FromChloe,
  HourGridSection,
  ProjectionSection,
  SectionTitle,
  SummaryCard,
  TipCard,
  Unavailable,
  WeekTypeSection,
} from "@/components/admin/ca/CaView";

// La page « Chiffre d'affaires » (maquette validée par Mehdi le 2026-11-15 :
// https://claude.ai/artifact/BpMKiqkWJ3DppGeXxX6dzE). Ouverte depuis le bloc
// CA de Stats ; remplace l'ancienne page Prévisions (/forecast y redirige).
// La page charge, lib/revenue-page.ts calcule, components/admin/ca affiche.
// Surface ADMIN : euros permis (ADR 0007 ne vise que le membre).

export const dynamic = "force-dynamic";

function holidaySet(today: string): Set<string> {
  const y = Number(today.slice(0, 4));
  return new Set([...belgianPublicHolidays(y).keys(), ...belgianPublicHolidays(y + 1).keys()]);
}

export default async function ChiffrePage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantId: string }>;
  searchParams: Promise<{ periode?: string }>;
}) {
  const { restaurantId } = await params;
  const { periode } = await searchParams;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!(await isEstablishmentAdmin(user.id, restaurantId))) redirect("/join");

  const base = `/admin/${restaurantId}`;
  const today = todayInBrussels();
  const periodKey = parseStatsPeriod(periode);
  const period = statsPeriod(periodKey, today, null);
  const since = period.previous?.from ?? period.current.from;

  const [access, forecastAccess, source, caBlock] = await Promise.all([
    getEntitlement(restaurantId, "revenue_tracker"),
    getEntitlement(restaurantId, "forecast"),
    loadCaSource(restaurantId),
    loadCaDays(restaurantId, today, since),
  ]);

  const header = (
    <div className="space-y-2">
      <Link href={base} className="min-h-[44px] inline-flex items-center text-[15px] font-semibold text-boost-olive-dark hover:underline">
        Retour aux Stats
      </Link>
      <PageHeader title="Chiffre d'affaires" />
    </div>
  );

  if (!access.allowed) {
    return (
      <div className="space-y-5 max-w-2xl">
        {header}
        <div className="bg-boost-cream rounded-xl p-4 flex flex-col gap-2">
          <p className="text-[15px] font-semibold text-ink">Avec Croissance</p>
          <p className="text-[15px] leading-snug text-ink">
            Ton chiffre jour par jour, ta semaine type, tes heures de pointe, combien tu vas faire ce mois-ci et ce que Chloé te conseille d&apos;en faire.
          </p>
          <RequestPlanButton
            restaurantId={restaurantId}
            feature="revenue_tracker"
            requiredPlan="croissance"
            className="self-start min-h-[44px] px-4 rounded-lg bg-boost-olive text-white text-[13px] font-semibold hover:bg-boost-olive-dark transition-colors"
          />
        </div>
      </div>
    );
  }

  if (!caBlock.ok) {
    return (
      <div className="space-y-5 max-w-2xl">
        {header}
        <Unavailable what="Ton chiffre d'affaires" />
      </div>
    );
  }

  const days = caBlock.data.days;
  const program = caBlock.data.program;
  const lastRead = lastReadDay(days, today);
  const window = readWindow(period, lastRead);
  const summary = window ? caSummary(days, window, program, period.previous !== null) : null;
  const bars = caBars(days, period, today, lastRead);
  const week = weekType(days, lastRead);

  // Combien tu vas faire : le mois en cours et le suivant, depuis le dernier jour lu.
  const holidays = holidaySet(today);
  const thisMonth = monthStart(today);
  const nextMonth = monthStart(addDays(thisMonth, 32));
  const month = lastRead && week ? projectMonth(days, thisMonth, lastRead, week, holidays) : null;
  // projectMonth refuse sans 4 semaines lues par jour ouvert (calibré sur l'historique réel).
  const next = lastRead && week ? projectMonth(days, nextMonth, lastRead, week, holidays) : null;
  const prevMonth = monthStart(addDays(thisMonth, -1));
  const prevActual = monthActual(days, prevMonth);
  const lastMonth = prevActual !== null ? { name: monthName(prevMonth), total: prevActual } : null;
  if (month) console.info("[ca] projection", restaurantId, JSON.stringify({ today, lastRead, month: month.month, expected: month.expected, low: month.low, high: month.high }));

  // Heures et canaux (8 et 4 semaines qui finissent au dernier jour lu).
  const [hourly, channels] = await Promise.all([
    source === "belpeople" && lastRead ? loadHourly(restaurantId, addDays(lastRead, -56)) : Promise.resolve(null),
    lastRead ? loadChannels(restaurantId, source, addDays(lastRead, -27), lastRead) : Promise.resolve(null),
  ]);
  const grid = hourly?.ok ? hourGrid(hourly.data, lastRead) : null;
  const mix = channels?.ok && lastRead ? channelMix(channels.data.parts, channels.data.unit, { from: addDays(lastRead, -27), to: lastRead }) : null;

  // Prévision (ADR 0027) : même moteur que l'ex-page Prévisions.
  let forecastInputs: Awaited<ReturnType<typeof loadForecastInputs>> | null = null;
  let forecast: ReturnType<typeof forecastFrom> | null = null;
  try {
    forecastInputs = await loadForecastInputs(restaurantId);
    forecast = forecastFrom(forecastInputs, today);
  } catch (e) {
    console.error("[ca] prévision :", (e as Error).message);
  }
  const forecastDays: ForecastDayLite[] | null =
    forecastAccess.allowed && forecast?.status === "ok"
      ? forecast.days.map((d) => ({ date: d.date, expected: d.expected, closed: d.closed, factors: d.factors }))
      : null;

  const tips = chloeTips({ base, week, grid, orders: recentOrders(days, lastRead), channels: mix, forecast: forecastDays });
  const hourTip = tips.find((t) => t.id === "heures") ?? null;
  const otherTips = tips.filter((t) => t.id !== "heures");
  const editBase = source === "belpeople" ? null : `${base}/ca`;

  return (
    <div className="space-y-6 max-w-2xl">
      {header}
      <p className="text-[15px] text-ink-muted -mt-3">
        {lastRead
          ? source === "belpeople"
            ? `Lu dans ta caisse (Belpeople) jusqu'au ${longDay(lastRead)}. Ta caisse donne ses chiffres une semaine après : les jours suivants arrivent seuls.`
            : `Chiffre noté jusqu'au ${longDay(lastRead)}.`
          : "Aucun jour de chiffre d'affaires lu pour le moment."}
      </p>
      <StatsPeriodTabs value={periodKey} />

      {summary ? <SummaryCard s={summary} /> : <Card><p className="text-[15px] text-ink-muted">Aucun jour lu sur cette période.</p></Card>}

      <ProjectionSection month={month} next={next} lastMonth={lastMonth} />
      {month && (
        <Card padding="p-4" className="space-y-2">
          <FromChloe />
          <p className="text-[15px] text-ink leading-relaxed">{projectionSentence(month, lastMonth, summary?.compare ?? null, summary?.notedDays ?? 0)}</p>
        </Card>
      )}

      {otherTips.length > 0 && (
        <section className="space-y-3" aria-labelledby="ca-retenir">
          <SectionTitle id="ca-retenir">Ce qu&apos;il faut retenir</SectionTitle>
          {otherTips.map((t) => (
            <TipCard key={t.id} tip={t} />
          ))}
        </section>
      )}

      {bars.length > 0 && (
        <section className="space-y-3" aria-labelledby="ca-courbe">
          <SectionTitle id="ca-courbe">Jour par jour</SectionTitle>
          <Card>
            <DayBars bars={bars} compareAvg={summary?.compare?.avgPerDay ?? null} compareName={period.compareName} />
          </Card>
        </section>
      )}

      {week && <WeekTypeSection week={week} />}
      {hourly && !hourly.ok && <Unavailable what="Tes heures de pointe" />}
      {grid && <HourGridSection grid={grid} tip={hourTip} />}
      {channels && !channels.ok && <Unavailable what="D'où vient ton chiffre" />}
      {mix && <ChannelsSection mix={mix} programSharePct={summary?.programSharePct ?? null} />}

      {forecast && forecastInputs ? (
        <ForecastSection restaurantId={restaurantId} inputs={forecastInputs} forecast={forecast} today={today} />
      ) : (
        <Unavailable what="Les 7 prochains jours" />
      )}

      {window && <DayList days={days} window={window} editBase={editBase} today={today} />}
    </div>
  );
}
