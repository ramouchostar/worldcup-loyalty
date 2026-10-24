import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ProgressBar } from "@/components/admin/ui";
import type { ForecastResult } from "@/lib/forecast";
import { CHART_MIN_NOTED_DAYS, FORECAST_MIN_NOTED_DAYS, type WeeksView } from "@/lib/revenue-weeks";

// ADR 0087 §5 — « Ta performance » sur l'accueil : semaine après semaine dès 14
// jours notés, puis les 7 prochains jours dès 28. Avant, la carte dit combien
// de jours il manque : le geste quotidien a un but visible.
// Charte Boosteats (boost-*), euros permis : surface restaurateur (ADR 0007).

const eur = (n: number) => n.toLocaleString("fr-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const signed = (p: number) => `${p > 0 ? "+" : p < 0 ? "−" : "±"}${Math.abs(p)} %`;
const shortDate = (d: string) => `${Number(d.slice(8, 10))}/${d.slice(5, 7)}`;

export function RevenueWeeksCard({
  view,
  forecast,
  forecastHref,
}: {
  view: WeeksView;
  /** null : pas encore 28 jours notés, ou forfait sans prévisions. */
  forecast: ForecastResult | null;
  forecastHref: string;
}) {
  const n = view.notedDays;
  return (
    <section className="bg-white border border-paper-border rounded-2xl p-5" aria-labelledby="ta-performance">
      <h2 id="ta-performance" className="font-brand-display text-[20px] font-extrabold text-ink">
        Ta performance
      </h2>

      {n < CHART_MIN_NOTED_DAYS || view.weeks.length < 2 ? (
        <Unlock noted={n} target={CHART_MIN_NOTED_DAYS} text="Ton graphique semaine après semaine s'affiche à 14 jours notés." />
      ) : (
        <Weeks view={view} />
      )}

      <div className="mt-5 pt-4 border-t border-paper-border">
        <h3 className="font-brand-display text-[16px] font-extrabold text-ink">Tes 7 prochains jours</h3>
        {n < FORECAST_MIN_NOTED_DAYS ? (
          <Unlock noted={n} target={FORECAST_MIN_NOTED_DAYS} text="Tes prévisions arrivent à 28 jours notés : chaque jour saisi les rend plus justes." />
        ) : forecast === null ? (
          <p className="text-[13px] text-ink-muted mt-1">Les prévisions sont dans le forfait Pro.</p>
        ) : forecast.status !== "ok" ? (
          <p className="text-[13px] text-ink-muted mt-1">{forecast.message}</p>
        ) : (
          <>
            <p className="mt-1 text-[13.5px] text-ink-body">
              Environ <strong className="font-brand-display text-[18px] font-extrabold text-ink tabular-nums">{eur(forecast.weekTotal.expected)}</strong>{" "}
              <span className="text-ink-muted tabular-nums">
                (entre {eur(forecast.weekTotal.low)} et {eur(forecast.weekTotal.high)})
              </span>
            </p>
            <ul className="mt-2 grid grid-cols-7 gap-1 text-center">
              {forecast.days.map((d) => (
                <li key={d.date} className="rounded-lg bg-paper px-0.5 py-1.5">
                  <span className="block text-[10.5px] text-ink-faint">{d.weekdayLabel}</span>
                  <span className="block text-[11.5px] font-semibold text-ink tabular-nums">
                    {d.closed ? "—" : `${Math.round(d.expected / 10) * 10}`}
                  </span>
                </li>
              ))}
            </ul>
            <Link href={forecastHref} className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-ink underline underline-offset-4">
              Voir le détail et les raisons <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
            </Link>
          </>
        )}
      </div>
    </section>
  );
}

function Unlock({ noted, target, text }: { noted: number; target: number; text: string }) {
  return (
    <div className="mt-2">
      <p className="text-[13px] text-ink-muted">
        <span className="font-semibold text-ink tabular-nums">
          {Math.min(noted, target)} jours notés sur {target}.
        </span>{" "}
        {text}
      </p>
      <ProgressBar value={Math.min(noted, target)} max={target} tone="boost" label={`${Math.min(noted, target)} jours notés sur ${target}`} className="mt-2" />
    </div>
  );
}

function Weeks({ view }: { view: WeeksView }) {
  const top = Math.max(1, ...view.weeks.map((w) => w.avgPerDay));
  const last = view.weeks[view.weeks.length - 1];
  return (
    <div className="mt-3">
      <p className="text-[13.5px] text-ink-body">
        La semaine dernière :{" "}
        <strong className="font-brand-display text-[18px] font-extrabold text-ink tabular-nums">{eur(last.avgPerDay)}</strong> par jour
        {last.deltaPct !== null && (
          <span className={`ml-2 text-[13px] font-bold tabular-nums ${last.deltaPct >= 0 ? "text-boost-olive-dark" : "text-ink"}`}>
            {signed(last.deltaPct)} vs la semaine d&apos;avant
          </span>
        )}
      </p>
      <div className="flex items-end gap-2 h-28 mt-3" role="img" aria-label="CA moyen par jour noté, semaine par semaine">
        {view.weeks.map((w) => (
          <div key={w.monday} className="flex-1 h-full flex flex-col justify-end items-center gap-1 min-w-0">
            {w.deltaPct !== null && (
              <span className={`text-[10px] font-semibold tabular-nums ${w.deltaPct >= 0 ? "text-boost-olive-dark" : "text-ink-muted"}`}>
                {signed(w.deltaPct)}
              </span>
            )}
            <div
              className={`w-full rounded-t-[3px] ${w === last ? "bg-boost-olive" : "bg-boost-light"}`}
              style={{ height: `${Math.max(6, (w.avgPerDay / top) * 80)}%` }}
              title={`Semaine du ${shortDate(w.monday)} : ${eur(w.avgPerDay)} par jour (${w.noted} jours notés)`}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-1.5" aria-hidden="true">
        {view.weeks.map((w) => (
          <span key={w.monday} className={`flex-1 text-center text-[10.5px] tabular-nums ${w === last ? "text-ink font-semibold" : "text-ink-faint"}`}>
            {shortDate(w.monday)}
          </span>
        ))}
      </div>
      <p className="text-[11.5px] text-ink-faint mt-2">CA moyen par jour noté, semaine par semaine (lundi → dimanche).</p>
    </div>
  );
}
