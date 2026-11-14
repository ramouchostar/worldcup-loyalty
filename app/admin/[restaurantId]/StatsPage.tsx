import { getRestaurant } from "@/lib/restaurant";
import { getAdminAccess, canManageEstablishment } from "@/lib/admin-guard";
import { getEntitlement, getPlan, type Plan } from "@/lib/entitlements";
import { todayInBrussels } from "@/lib/qr-funnel";
import { addDays, buildSimpleHomeView } from "@/lib/console-journey";
import { loadSimpleHomeRaw } from "@/lib/console-journey-data";
import { missingDays } from "@/lib/daily-revenue-entry";
import { isMessageEnabled } from "@/lib/message-log";
import { CA_REMINDER_KEY } from "@/lib/daily-revenue-reminders";
import { loadGrowthRaw } from "@/lib/growth-game-data";
import { buildGrowthView, MACHINE_TICKETS, BASELINE_DAYS, type GrowthView } from "@/lib/growth-game";
import { FORECAST_MIN_NOTED_DAYS } from "@/lib/revenue-weeks";
import { forecastFrom, loadForecastInputs } from "@/lib/forecast-data";
import {
  clientStats,
  revenueStats,
  statsHeadline,
  statsPeriod,
  topDishes,
  type StatsPeriodKey,
} from "@/lib/stats-page";
import {
  loadGiftDays,
  loadItemLines,
  loadMessages,
  loadReputation,
  loadRevenue,
  loadTickets,
  type Block,
} from "@/lib/stats-page-data";
import { StatsView } from "@/components/admin/simple/StatsView";
import { TodoCard } from "@/components/admin/simple/SimpleHome";
import { HomeBottomNotices, HomeTopNotices } from "@/components/admin/simple/HomeNotices";

// L'onglet « Stats » de la vue simple (ADR 0064 amendé, ADR 0089) : la page
// charge, lib/stats-page.ts calcule, StatsView affiche. Le forfait décide des
// blocs — par les droits (getEntitlement, essais compris), jamais par un
// test sur le nom du forfait dans l'affichage.

const PLAN_LABEL: Record<Plan, string> = { gratuit: "Gratuit", croissance: "Croissance", pro: "Pro" };

function progressionLine(g: GrowthView): string {
  if (g.stage === "machine") return `Étape 1 · ${g.tickets90} ticket${g.tickets90 > 1 ? "s" : ""} sur ${MACHINE_TICKETS}`;
  if (!g.game) return `Étape 2 · ${Math.min(g.notedDays, BASELINE_DAYS)} jours de chiffre notés sur ${BASELINE_DAYS}`;
  if (g.game.capReached) return `Niveau ${g.game.level} · le plus haut palier est atteint`;
  return `Niveau ${g.game.level} · ${g.game.heldWeeks} semaine${g.game.heldWeeks > 1 ? "s" : ""} tenue${g.game.heldWeeks > 1 ? "s" : ""} vers le suivant`;
}

export async function StatsPage({
  restaurantId,
  userId,
  periodKey,
  bienvenue,
  seat,
}: {
  restaurantId: string;
  userId: string;
  periodKey: StatsPeriodKey;
  bienvenue: boolean;
  seat?: string;
}) {
  const base = `/admin/${restaurantId}`;
  const today = todayInBrussels();

  const [access, restaurant, plan, revenueAccess, salesAccess, benchAccess, tickets] = await Promise.all([
    getAdminAccess(userId, restaurantId),
    getRestaurant(restaurantId),
    getPlan(restaurantId),
    getEntitlement(restaurantId, "revenue_tracker"),
    getEntitlement(restaurantId, "sales"),
    getEntitlement(restaurantId, "sector_benchmarks"),
    loadTickets(restaurantId),
  ]);

  const firstDay = tickets.ok && tickets.data.length > 0 ? tickets.data.reduce((m, t) => (t.day < m ? t.day : m), tickets.data[0].day) : null;
  const period = statsPeriod(periodKey, today, firstDay);
  const since = period.previous?.from ?? period.current.from;

  const [gifts, revenueBlock, reputation, messages, items, homeRaw, growthRaw] = await Promise.all([
    loadGiftDays(restaurantId, since),
    loadRevenue(restaurantId, today, since),
    loadReputation(restaurantId, period.current),
    loadMessages(restaurantId, period.current),
    salesAccess.allowed ? loadItemLines(restaurantId, period.current) : Promise.resolve(null),
    loadSimpleHomeRaw(restaurantId, { canManage: canManageEstablishment(access) }),
    loadGrowthRaw(restaurantId, today),
  ]);

  const clients: Block<ReturnType<typeof clientStats>> =
    tickets.ok && gifts.ok ? { ok: true, data: clientStats(tickets.data, period, gifts.data) } : { ok: false };

  const revenue: Block<ReturnType<typeof revenueStats>> = revenueBlock.ok
    ? { ok: true, data: revenueStats(revenueBlock.data.days, revenueBlock.data.program, period, today) }
    : { ok: false };

  // La prévision (ADR 0027) : même seuil que l'accueil, 28 jours notés.
  let forecast: { expected: number; low: number; high: number } | null = null;
  if (revenueAccess.allowed && revenueBlock.ok) {
    const noted = revenueBlock.data.days.filter((d) => !d.closed && typeof d.amount === "number").length;
    if (noted >= FORECAST_MIN_NOTED_DAYS && (await getEntitlement(restaurantId, "forecast")).allowed) {
      try {
        const f = forecastFrom(await loadForecastInputs(restaurantId), new Date().toISOString().slice(0, 10));
        if (f.status === "ok") forecast = f.weekTotal;
      } catch (e) {
        console.error("[stats] prévision :", (e as Error).message);
      }
    }
  }

  // ADR 0064 / 0087 §5 — ce qu'il y a à faire (QR de l'équipe, tickets à
  // vérifier, jours sans CA) reste visible à l'arrivée : la maquette Stats ne
  // le montrait pas, mais ces tâches n'ont pas d'autre place dans la vue simple.
  const notesCa =
    (revenueBlock.ok && revenueBlock.data.days.some((d) => d.day >= addDays(today, -28))) ||
    (await isMessageEnabled(CA_REMINDER_KEY, restaurantId));
  const caMissing = notesCa && revenueBlock.ok ? missingDays(new Set(revenueBlock.data.days.map((d) => d.day)), today) : [];
  const home = buildSimpleHomeView({ ...homeRaw, caMissing });

  const growth = buildGrowthView(growthRaw);
  const headline = clients.ok
    ? statsHeadline({ period, clients: clients.data, revenue: revenueAccess.allowed && revenue.ok ? revenue.data : null })
    : "Tes chiffres n'ont pas pu être lus pour l'instant.";

  return (
    <StatsView
      restaurantId={restaurantId}
      planLabel={PLAN_LABEL[plan]}
      period={period}
      headline={headline}
      clients={clients}
      revenue={{ allowed: revenueAccess.allowed, block: revenue, noteHref: `${base}/ca/${addDays(today, -1)}`, forecast, today }}
      dishes={items ? (items.ok ? { ok: true, data: topDishes(items.data) } : { ok: false }) : null}
      dishesHref={`${base}/sales`}
      google={reputation.google}
      social={reputation.social}
      messages={messages}
      progression={{ href: `${base}/progression`, line: progressionLine(growth) }}
      upsell={!revenueAccess.allowed ? "croissance" : !benchAccess.allowed ? "pro" : null}
      benchmarksHref={benchAccess.allowed ? `${base}/benchmarks` : null}
      top={<HomeTopNotices bienvenue={bienvenue} seat={seat} pending={restaurant?.status === "pending"} />}
      todo={home.todo.length > 0 ? <TodoCard view={home} /> : null}
      bottom={<HomeBottomNotices restaurantId={restaurantId} bienvenue={bienvenue} />}
    />
  );
}
