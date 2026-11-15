import { createAdminClient } from "@/lib/supabase";
import type { DayForecast, ForecastResult } from "@/lib/forecast";
import type { ForecastInputs } from "@/lib/forecast-data";
import SalesImport from "@/components/admin/SalesImport";
import LocalEventManager, { type EventItem } from "@/components/admin/LocalEventManager";
import { ensureTrialStarted, getEntitlement } from "@/lib/entitlements";
import { PaywallSection, TrialBanner } from "@/components/admin/Paywall";
import { detectGranularity, summarizeTrend } from "@/lib/sales-granularity";
import { Card } from "@/components/admin/ui";
import { listDay } from "@/lib/revenue-page";

// « Les 7 prochains jours » de la page Chiffre d'affaires — l'ex-page
// Prévisions (ADR 0027), déplacée telle quelle : même moteur, même essai
// (ADR 0029 §5), même import de ventes (toujours ouvert) et mêmes événements.

const euro0 = (n: number) => Number(n).toLocaleString("fr-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

const CONFIDENCE: Record<"low" | "medium" | "high", { label: string; cls: string }> = {
  low: { label: "Confiance faible", cls: "bg-warn/12 text-warn" },
  medium: { label: "Confiance moyenne", cls: "bg-paper-subtle text-ink-body" },
  high: { label: "Confiance élevée", cls: "bg-good/12 text-good" },
};

export async function ForecastSection({
  restaurantId,
  inputs,
  forecast,
  today,
}: {
  restaurantId: string;
  inputs: ForecastInputs;
  forecast: ForecastResult;
  today: string;
}) {
  const importRes = await createAdminClient()
    .from("sales_imports")
    .select("filename, row_count, date_min, date_max, imported_at")
    .eq("restaurant_id", restaurantId)
    .order("imported_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const daily = inputs.daily;
  const gran = detectGranularity(daily.map((r) => r.sold_on));
  const nonDaily = gran.kind === "weekly" || gran.kind === "monthly";
  const trend = nonDaily
    ? summarizeTrend(daily.map((r) => ({ sold_on: r.sold_on, amount: Number(r.total) })), gran.kind as "weekly" | "monthly")
    : null;

  if (forecast.status !== "insufficient_data" || (nonDaily && trend && trend.periods >= 2)) {
    await ensureTrialStarted(restaurantId, "forecast");
  }
  const ent = await getEntitlement(restaurantId, "forecast");
  const end = forecast.status === "ok" && forecast.days.length ? forecast.days[forecast.days.length - 1].date : null;

  return (
    <section id="previsions" className="space-y-3 scroll-mt-20" aria-labelledby="ca-previsions">
      <h2 id="ca-previsions" className="text-[17px] font-bold text-ink">
        Les 7 prochains jours
      </h2>
      <TrialBanner ent={ent} restaurantId={restaurantId} feature="forecast" />

      {nonDaily && trend ? (
        <PaywallSection
          ent={ent}
          restaurantId={restaurantId}
          feature="forecast"
          enabled={trend.periods >= 2}
          title="Débloque ta tendance de ventes"
          pitch="Ton rapport est prêt à être lu : niveau moyen, dernière période, direction. Passe au plan Croissance pour le consulter."
        >
          <Card className="space-y-2">
            <p className="text-[13px] text-ink-muted">Tendance par {trend.periodLabel}</p>
            <div className="flex justify-between text-[15px] text-ink">
              <span>Moyenne récente</span>
              <strong className="tabular-nums">{euro0(trend.avgRecent)}</strong>
            </div>
            <div className="flex justify-between text-[15px] text-ink">
              <span>Dernière {trend.periodLabel}</span>
              <strong className="tabular-nums">{trend.last !== null ? euro0(trend.last) : "pas lue"}</strong>
            </div>
            <p className="text-[13px] text-ink-muted">
              Ton rapport est {trend.periodLabel === "semaine" ? "hebdomadaire" : "mensuel"} : pour une prévision jour par jour, dépose le détail par jour
              (la plupart des caisses l&apos;exportent sous « Rapports », « Ventes par jour »).
            </p>
          </Card>
        </PaywallSection>
      ) : forecast.status === "insufficient_data" ? (
        <Card className="text-center space-y-1">
          <p className="text-[15px] font-semibold text-ink">Pas encore assez de jours pour prévoir</p>
          <p className="text-[13px] text-ink-muted">{forecast.message}</p>
          <p className="text-[13px] text-ink-muted">
            Historique actuel : {forecast.weeksOfData} semaine{forecast.weeksOfData > 1 ? "s" : ""}, il en faut au moins 4.
          </p>
        </Card>
      ) : (
        <PaywallSection
          ent={ent}
          restaurantId={restaurantId}
          feature="forecast"
          title="Débloque tes prévisions"
          pitch="Ta prévision de la semaine est prête : fourchette jour par jour, paye, vacances et événements calibrés sur ton historique. Passe au plan Croissance pour la consulter."
        >
          <Card className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[13px] text-ink-muted">
                  {end ? `Du ${listDay(forecast.days[0].date).toLowerCase()} au ${listDay(end).toLowerCase()}` : "7 prochains jours"}
                </p>
                <p className="font-display text-[24px] font-bold text-ink tabular-nums">{euro0(forecast.weekTotal.expected)}</p>
                <p className="text-[13px] text-ink-muted tabular-nums">
                  entre {euro0(forecast.weekTotal.low)} et {euro0(forecast.weekTotal.high)}
                </p>
              </div>
              <span className={`shrink-0 text-[12px] font-semibold px-2.5 py-1 rounded-full ${CONFIDENCE[forecast.confidence].cls}`}>
                {CONFIDENCE[forecast.confidence].label}
              </span>
            </div>
            <ul className="divide-y divide-paper-border border-t border-paper-border">
              {forecast.days.map((d) => (
                <DayRow key={d.date} day={d} today={today} />
              ))}
            </ul>
            <p className="text-[13px] text-ink-muted">
              Calculé sur les mêmes jours des semaines passées, la paye, les vacances, les jours fériés et tes événements. {forecast.confidenceReason}
            </p>
          </Card>
        </PaywallSection>
      )}

      <LocalEventManager restaurantId={restaurantId} events={inputs.events as EventItem[]} />
      <SalesImport restaurantId={restaurantId} lastImport={importRes.data ?? null} />
    </section>
  );
}

function DayRow({ day }: { day: DayForecast; today: string }) {
  const factors = day.factors.filter((f) => Math.abs(f.effect) >= 0.01);
  return (
    <li className="py-2.5 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-[15px] text-ink">
      <span>{listDay(day.date)}</span>
      <strong className="text-right tabular-nums">{day.closed ? "fermé d'habitude" : euro0(day.expected)}</strong>
      <span className="text-[13px] text-ink-muted">
        {day.closed
          ? ""
          : factors.length
            ? factors.map((f) => `${f.label} ${f.estimated ? "≈" : ""}${f.effect >= 0 ? "+" : "−"}${Math.round(Math.abs(f.effect) * 100)} %`).join(", ")
            : `Comme tes ${day.weekdayLabel.toLowerCase()}s`}
      </span>
      <span className="text-[13px] text-ink-muted text-right tabular-nums">{day.closed ? "" : `${euro0(day.low)} à ${euro0(day.high)}`}</span>
    </li>
  );
}
