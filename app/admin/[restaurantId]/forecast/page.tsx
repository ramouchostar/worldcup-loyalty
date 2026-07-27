import { redirect } from "next/navigation";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { isEstablishmentAdmin } from "@/lib/admin-guard";
import {
  computeForecast,
  type SaleRow,
  type RefCalRow,
  type LocalEventRow,
  type DayForecast,
  type Factor,
} from "@/lib/forecast";
import SalesImport from "@/components/admin/SalesImport";
import LocalEventManager, { type EventItem } from "@/components/admin/LocalEventManager";

// Prévisions de CA (ADR 0027). Surface ADMIN uniquement — le restaurateur a
// le droit de voir ses euros (l'ADR 0007 ne vise que le membre). Rien ici
// n'atteint jamais une surface client.

const euro0 = (n: number) =>
  Number(n).toLocaleString("fr-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

const CONFIDENCE: Record<"low" | "medium" | "high", { label: string; cls: string }> = {
  low: { label: "Confiance faible", cls: "bg-amber-100 text-amber-800" },
  medium: { label: "Confiance moyenne", cls: "bg-blue-100 text-blue-800" },
  high: { label: "Confiance élevée", cls: "bg-green-100 text-green-800" },
};

export default async function ForecastPage({
  params,
}: {
  params: Promise<{ restaurantId: string }>;
}) {
  const { restaurantId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!(await isEstablishmentAdmin(user.id, restaurantId))) redirect("/join");

  const admin = createAdminClient();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const since = new Date(now.getTime() - 182 * 86_400_000).toISOString().slice(0, 10); // ~26 semaines
  const in7 = new Date(now.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);

  const [restoRes, dailyRes, refCalRes, eventsRes, promoRes, importRes] = await Promise.all([
    admin.from("restaurants").select("school_calendar").eq("id", restaurantId).maybeSingle(),
    admin.rpc("daily_sales_totals", { p_restaurant_id: restaurantId, p_since: since }),
    admin
      .from("reference_calendar")
      .select("kind, community, starts_on, ends_on, label, expected_effect")
      .gte("ends_on", since),
    admin
      .from("restaurant_events")
      .select("id, label, starts_on, ends_on, expected_effect")
      .eq("restaurant_id", restaurantId)
      .gte("ends_on", since)
      .order("starts_on", { ascending: true }),
    admin
      .from("scheduled_broadcasts")
      .select("promo_on")
      .eq("restaurant_id", restaurantId)
      .not("promo_on", "is", null)
      .gte("promo_on", today)
      .lte("promo_on", in7),
    admin
      .from("sales_imports")
      .select("filename, row_count, date_min, date_max, imported_at")
      .eq("restaurant_id", restaurantId)
      .order("imported_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const daily = (dailyRes.data ?? []) as { sold_on: string; total: number }[];
  const sales: SaleRow[] = daily.map((r) => ({ sold_on: r.sold_on, sold_at: null, amount: Number(r.total) }));
  const community = (restoRes.data?.school_calendar ?? null) as "FR" | "NL" | "DE" | null;
  const events = (eventsRes.data ?? []) as EventItem[];

  const forecast = computeForecast({
    today,
    sales,
    referenceCalendar: (refCalRes.data ?? []) as RefCalRow[],
    localEvents: events.map<LocalEventRow>((e) => ({
      starts_on: e.starts_on,
      ends_on: e.ends_on,
      label: e.label,
      expected_effect: e.expected_effect,
    })),
    promoDates: ((promoRes.data ?? []) as { promo_on: string }[]).map((p) => p.promo_on),
    schoolCommunity: community,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Prévisions de chiffre d&apos;affaires</h1>
        <p className="text-gray-500 text-sm mt-1">
          Ce que ta caisse va probablement faire dans les 7 prochains jours — calculé sur tes ventes importées,
          la saisonnalité (paye, vacances, jours fériés) et tes événements. Une aide à la décision, pas une
          garantie. Vue réservée à toi.
        </p>
      </div>

      <SalesImport restaurantId={restaurantId} lastImport={importRes.data ?? null} />

      {forecast.status === "insufficient_data" ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-8 text-center">
          <p className="text-lg font-bold text-gray-900">Pas encore assez de données</p>
          <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">{forecast.message}</p>
          <p className="text-xs text-gray-400 mt-3">
            Historique actuel : {forecast.weeksOfData} semaine{forecast.weeksOfData > 1 ? "s" : ""} — il en faut
            au moins 4.
          </p>
        </div>
      ) : (
        <>
          {/* Hero — total semaine */}
          <div className="bg-brand-dark text-white rounded-2xl p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-300">7 prochains jours</p>
                <p className="text-3xl font-black mt-1 tabular-nums">
                  {euro0(forecast.weekTotal.low)} – {euro0(forecast.weekTotal.high)}
                </p>
                <p className="text-sm text-gray-300 mt-0.5">
                  estimation centrale <span className="font-semibold text-white">{euro0(forecast.weekTotal.expected)}</span>
                </p>
              </div>
              <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${CONFIDENCE[forecast.confidence].cls}`}>
                {CONFIDENCE[forecast.confidence].label}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-3">{forecast.confidenceReason}</p>
          </div>

          {/* Jour par jour */}
          <div className="grid sm:grid-cols-2 gap-3">
            {forecast.days.map((d) => (
              <DayCard key={d.date} day={d} />
            ))}
          </div>

          <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-500 space-y-1">
            <p>
              💡 La fourchette reflète la <span className="font-semibold">variabilité habituelle</span> de chaque
              jour. Les facteurs affichés (paye, vacances, événements…) sont calibrés sur{" "}
              <span className="font-semibold">ton propre historique</span> quand il est assez riche ; un «&nbsp;≈&nbsp;»
              signale une estimation (événement ou promo à venir, sans recul suffisant).
            </p>
            <p>
              💡 Plus tu importes de semaines, plus les prévisions se précisent et la confiance monte.
            </p>
          </div>
        </>
      )}

      <LocalEventManager restaurantId={restaurantId} events={events} />
    </div>
  );
}

function DayCard({ day }: { day: DayForecast }) {
  const [, m, dd] = day.date.split("-");
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <div className="flex items-baseline justify-between">
        <p className="font-semibold text-gray-900">
          {day.weekdayLabel} <span className="text-gray-400 font-normal">{dd}/{m}</span>
        </p>
        {day.closed ? (
          <span className="text-xs text-gray-400">habituellement fermé</span>
        ) : (
          <p className="text-lg font-black text-gray-900 tabular-nums">{euro0(day.expected)}</p>
        )}
      </div>
      {!day.closed && (
        <>
          <p className="text-xs text-gray-500 tabular-nums mt-0.5">
            {euro0(day.low)} – {euro0(day.high)}
          </p>
          {day.factors.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {day.factors.map((f, i) => (
                <FactorChip key={i} factor={f} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FactorChip({ factor }: { factor: Factor }) {
  const up = factor.effect >= 0;
  const pct = Math.round(Math.abs(factor.effect) * 100);
  return (
    <span
      className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
        up ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
      }`}
      title={factor.estimated ? "Estimation (recul insuffisant pour calibrer)" : "Calibré sur ton historique"}
    >
      {factor.label} {factor.estimated ? "≈" : ""}
      {up ? "+" : "−"}
      {pct}%
    </span>
  );
}
