import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { MembersTable, type MemberRow, type MemberStatus } from "@/components/platform/MembersTable";
import { StatTile } from "@/components/platform/StatTile";
import { getAppInstallsByUser, PLATFORM_LABEL } from "@/lib/app-install";
import { fetchAllRows } from "@/lib/paged-select";
import { selectRestaurantsWithDemo } from "@/lib/demo";
import { getMemberStats, type MemberStats, type TrendWeek } from "@/lib/member-stats";
import { MembersFilter } from "./MembersFilter";

export const metadata = { title: "Membres — Plateforme" };

// Page de décision : on l'ouvre pour voir où en est le réseau cette semaine.
// Un cache de quelques minutes y ferait plus de mal que de bien (même choix
// que /platform/stats).
export const dynamic = "force-dynamic";

type MembershipRow = {
  user_id: string;
  restaurant_id: string;
  joined_at: string;
  profiles: { display_name: string | null; email: string | null } | null;
  teams: { name: string; flag_emoji: string } | null;
};

type OrderRow = { user_id: string; restaurant_id: string; order_date: string };
type RestaurantRow = { id: string; name: string; status: string; is_demo?: boolean };

const LIST_LIMIT = 500;
/** Sans ticket depuis ce délai, un membre qui a déjà commandé est « endormi ». */
const ACTIVE_DAYS = 30;
/** En deçà, un membre sans ticket est encore « nouveau », pas « inactif ». */
const NEW_DAYS = 15;

// ADR 0030 §7 — « Membres » : liste nominative complète du réseau, réservée
// au super-admin (ADR 0025 : la plateforme est l'unique responsable de
// traitement). Filtrable par établissement (`?restaurant=`) — c'est le lien
// « Membres » du bandeau Mode plateforme.
//
// v2 (2026-09-06) : la page s'ouvre désormais sur quatre chiffres comparés à
// la semaine précédente (membres, équipes créées, app installée, tickets par
// membre actif — lib/member-stats.ts), au-dessus de la liste.
//
// Périmètre par défaut = RÉSEAU RÉEL, comptes démo exclus (ADR 0033 §1 : un
// chiffre de traction qui additionne les restos fictifs est faux, et c'est le
// chiffre sur lequel on décide). `?demo=1` les réintègre — le « commutateur »
// prévu par l'ADR. Les tuiles et le tableau lisent TOUJOURS le même périmètre :
// deux comptages qui se contredisent à l'écran valent moins que pas de
// comptage du tout.

function daysSince(day: string, today: string): number {
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000);
}

function statusOf(orderCount: number, lastOrder: string | null, joined: string, today: string): MemberStatus {
  if (lastOrder && daysSince(lastOrder, today) <= ACTIVE_DAYS) return "actif";
  if (orderCount > 0) return "endormi";
  return daysSince(joined.slice(0, 10), today) < NEW_DAYS ? "nouveau" : "inactif";
}

const nf = new Intl.NumberFormat("fr-BE");
const rf = new Intl.NumberFormat("fr-BE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function weekRange(w: TrendWeek): string {
  const d = (iso: string, withMonth: boolean) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-BE", {
      timeZone: "UTC",
      day: "numeric",
      ...(withMonth ? { month: "short" } : {}),
    });
  const sameMonth = w.start.slice(0, 7) === w.end.slice(0, 7);
  return `${d(w.start, !sameMonth)} → ${d(w.end, true)}`;
}

function StatsRow({ stats }: { stats: MemberStats }) {
  const plural = (n: number, one: string, many: string) => (Math.abs(n) > 1 ? many : one);

  // `gap-px` sur un fond gris plutôt que `divide-x` : dans une grille
  // multi-lignes, Tailwind pose la bordure de séparation sur tous les enfants
  // sauf le premier — donc aussi sur le premier de la 2e ligne, qui se
  // retrouve avec un trait vertical parasite contre le bord gauche.
  return (
    <section className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-gray-100 bg-gray-100 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
      <StatTile
        label="Membres"
        value={nf.format(stats.members.total)}
        hint={`${nf.format(stats.members.joined.current)} ${plural(stats.members.joined.current, "nouveau membre", "nouveaux membres")} sur 7 jours`}
        trend={stats.members.joined}
        format={(n) => nf.format(n)}
        describeWeek={(w) => `${weekRange(w)} : ${nf.format(w.value)} ${plural(w.value, "nouveau membre", "nouveaux membres")}`}
      />
      <StatTile
        label="Équipes créées"
        value={nf.format(stats.teams.total)}
        hint={`${nf.format(stats.teams.created.current)} ${plural(stats.teams.created.current, "équipe créée", "équipes créées")} sur 7 jours`}
        trend={stats.teams.created}
        format={(n) => nf.format(n)}
        describeWeek={(w) => `${weekRange(w)} : ${nf.format(w.value)} ${plural(w.value, "équipe créée", "équipes créées")}`}
      />
      <StatTile
        label="App installée"
        value={nf.format(stats.installs.total)}
        hint={
          stats.installs.sharePct === null
            ? `${nf.format(stats.installs.installed.current)} sur 7 jours`
            : `${stats.installs.sharePct} % des membres · ${nf.format(stats.installs.installed.current)} ${plural(stats.installs.installed.current, "nouvelle", "nouvelles")} sur 7 jours`
        }
        trend={stats.installs.installed}
        format={(n) => nf.format(n)}
        describeWeek={(w) => `${weekRange(w)} : ${nf.format(w.value)} ${plural(w.value, "installation", "installations")}`}
      />
      <StatTile
        label="Tickets par membre actif"
        value={stats.ordersPerActiveMember.ratio === null ? "—" : rf.format(stats.ordersPerActiveMember.ratio)}
        hint={`${nf.format(stats.ordersPerActiveMember.orders)} ${plural(stats.ordersPerActiveMember.orders, "ticket validé", "tickets validés")} · ${nf.format(stats.ordersPerActiveMember.activeMembers)} ${plural(stats.ordersPerActiveMember.activeMembers, "membre actif", "membres actifs")} sur 7 jours`}
        trend={stats.ordersPerActiveMember.trend}
        format={(n) => rf.format(n)}
        describeWeek={(w) => `${weekRange(w)} : ${rf.format(w.value)} ${plural(w.value, "ticket", "tickets")} par membre actif`}
      />
    </section>
  );
}

export default async function PlatformMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ restaurant?: string; demo?: string }>;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  if (!profile?.is_super_admin) redirect("/join?reason=platform-required");

  const { restaurant: restaurantFilter, demo } = await searchParams;
  const includeDemo = demo === "1";
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  // Tolérant à m56 non appliquée : repli sur les colonnes historiques, comme
  // le reste de la console (lib/demo.ts).
  const { rows: restaurants, demoColumnMissing } = await selectRestaurantsWithDemo<RestaurantRow>(
    admin,
    "id, name, status, is_demo",
    "id, name, status"
  );
  const restaurantNames = new Map(restaurants.map((r) => [r.id, r.name]));
  const liveIds = restaurants.filter((r) => r.status === "active" && r.is_demo !== true).map((r) => r.id);
  const scopeIds = restaurantFilter ? [restaurantFilter] : includeDemo ? restaurants.map((r) => r.id) : liveIds;

  const membershipQuery = admin
    .from("memberships")
    .select("user_id, restaurant_id, joined_at, profiles!inner(display_name, email), teams(name, flag_emoji)")
    .in("restaurant_id", scopeIds)
    .order("joined_at", { ascending: false })
    .limit(LIST_LIMIT);

  // Les chiffres d'en-tête et la liste échouent indépendamment : une erreur
  // d'agrégat ne doit pas priver de la liste nominative, et l'inverse non plus.
  const [{ data: membershipsRaw }, statsResult] = await Promise.all([
    scopeIds.length > 0 ? membershipQuery : Promise.resolve({ data: [] as unknown[] }),
    getMemberStats(scopeIds, today).then(
      (stats) => ({ stats, error: null as string | null }),
      (e: Error) => {
        console.error("[platform/members] getMemberStats failed:", e.message);
        return { stats: null, error: e.message };
      }
    ),
  ]);

  const memberships = (membershipsRaw as unknown as MembershipRow[]) ?? [];

  // Agrégats commandes (nb + dernière) par couple membre × établissement.
  const userIds = Array.from(new Set(memberships.map((m) => m.user_id)));
  // App installée (complément ADR 0038) — fail-open si la migration manque.
  const installs = await getAppInstallsByUser(userIds);

  // `.in("user_id", userIds)` avec jusqu'à 500 ids d'un coup + `.limit(20000)`
  // qui ne protège de rien (PostgREST tronque en silence à `max_rows`, 1000
  // par défaut — lib/paged-select.ts) : par lots ET paginé, comme le reste de
  // la console plateforme. Erreur explicite au lieu de zéros silencieux.
  const USER_BATCH = 200;
  const orders: OrderRow[] = [];
  let ordersError: string | null = null;
  try {
    for (let i = 0; i < userIds.length; i += USER_BATCH) {
      const batchIds = userIds.slice(i, i + USER_BATCH);
      const { rows } = await fetchAllRows<OrderRow>((from, to) =>
        admin
          .from("orders")
          .select("user_id, restaurant_id, order_date")
          .eq("status", "validated")
          .in("user_id", batchIds)
          .in("restaurant_id", scopeIds)
          .range(from, to)
      );
      orders.push(...rows);
    }
  } catch (e) {
    ordersError = (e as Error).message;
    console.error("[platform/members] orders fetch failed:", ordersError);
  }

  const byKey = new Map<string, { count: number; last: string | null }>();
  for (const o of orders) {
    const key = `${o.user_id}:${o.restaurant_id}`;
    const agg = byKey.get(key) ?? { count: 0, last: null };
    agg.count += 1;
    if (!agg.last || o.order_date > agg.last) agg.last = o.order_date;
    byKey.set(key, agg);
  }

  const fmt = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString("fr-BE", { day: "numeric", month: "short", year: "numeric" })
      : null;

  const rows: MemberRow[] = memberships.map((m) => {
    const agg = byKey.get(`${m.user_id}:${m.restaurant_id}`);
    const inst = installs.get(m.user_id);
    return {
      name: m.profiles?.display_name ?? "Membre",
      email: m.profiles?.email ?? null,
      restaurant: restaurantNames.get(m.restaurant_id) ?? m.restaurant_id,
      team: m.teams ? `${m.teams.flag_emoji} ${m.teams.name}` : null,
      joined: fmt(m.joined_at) ?? "—",
      orderCount: agg?.count ?? 0,
      lastActivity: fmt(agg?.last ?? null),
      app: inst ? `${PLATFORM_LABEL[inst.platform] ?? inst.platform} · depuis le ${fmt(inst.installed_at)}` : null,
      status: statusOf(agg?.count ?? 0, agg?.last ?? null, m.joined_at, today),
    };
  });

  const filterName = restaurantFilter ? restaurantNames.get(restaurantFilter) : null;
  const scopeHref = (nextDemo: boolean) => {
    const params = new URLSearchParams();
    if (restaurantFilter) params.set("restaurant", restaurantFilter);
    if (nextDemo) params.set("demo", "1");
    const qs = params.toString();
    return qs ? `/platform/members?${qs}` : "/platform/members";
  };

  const TAB = "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors";

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Membres</h1>
        <p className="mt-1 text-sm text-gray-500">
          {filterName ? (
            <>
              Membres de « {filterName} » —{" "}
              <Link href={scopeHref(includeDemo)} className="font-semibold text-platform-accent hover:underline">
                voir tout le réseau
              </Link>
            </>
          ) : (
            <>
              Qui rejoint, qui installe l&apos;app, qui revient — chaque chiffre comparé aux 7 jours précédents.
            </>
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Périmètre : réseau réel par défaut (ADR 0033). Deux liens, pas un
            état client — tout le contenu de la page en dépend. */}
        <div className="inline-flex items-center gap-1 rounded-xl bg-gray-100 p-1">
          <Link href={scopeHref(false)} className={`${TAB} ${includeDemo ? "text-gray-500 hover:text-gray-900" : "bg-white text-gray-900 shadow-sm"}`}>
            Réseau réel
          </Link>
          <Link href={scopeHref(true)} className={`${TAB} ${includeDemo ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-900"}`}>
            Démo comprise
          </Link>
        </div>
        <MembersFilter restaurants={restaurants} value={restaurantFilter ?? ""} demo={includeDemo} />
      </div>

      {demoColumnMissing && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Comptes démo non distingués</p>
          <p className="mt-0.5 text-xs text-amber-700">
            La colonne <span className="font-mono">is_demo</span> (m56) n&apos;est pas encore appliquée : les deux
            périmètres montrent la même chose, comptes de démonstration compris.
          </p>
        </div>
      )}

      {scopeIds.length === 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Aucun établissement dans ce périmètre</p>
          <p className="mt-0.5 text-xs text-amber-700">
            {includeDemo
              ? "Le réseau ne contient encore aucun établissement."
              : "Tous les établissements sont marqués « démo », ou aucun n'est encore actif — bascule sur « Démo comprise » pour les voir."}
          </p>
        </div>
      )}

      {statsResult.error && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Chiffres d&apos;en-tête indisponibles</p>
          <p className="mt-0.5 text-xs text-amber-700">
            La liste ci-dessous reste exacte, seuls les quatre compteurs ont échoué. Message :{" "}
            <span className="font-mono">{statsResult.error}</span>
          </p>
        </div>
      )}

      {statsResult.stats && <StatsRow stats={statsResult.stats} />}

      {statsResult.stats?.truncated && (
        <p className="text-xs text-amber-700">
          Plafond de lecture atteint : les chiffres d&apos;en-tête sont partiels (le réseau dépasse la pagination
          prévue). À basculer sur des agrégats SQL — voir le backlog.
        </p>
      )}

      {ordersError && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Volume de commandes indisponible</p>
          <p className="mt-0.5 text-xs text-amber-700">
            La liste des membres s&apos;affiche mais le nombre de tickets, la dernière activité et le statut
            n&apos;ont pas pu être calculés. Message : <span className="font-mono">{ordersError}</span>
          </p>
        </div>
      )}

      <MembersTable rows={rows} />

      <p className="text-xs text-gray-400">
        {memberships.length >= LIST_LIMIT
          ? `Liste limitée aux ${LIST_LIMIT} adhésions les plus récentes ; les chiffres d'en-tête, eux, portent sur tout le périmètre.`
          : "Chiffres d'en-tête et liste portent sur le même périmètre."}{" "}
        Les comptes super-admin sont exclus des quatre compteurs (on teste en prod sur le réseau réel), pas de la
        liste. Semaines glissantes de 7 jours finissant aujourd&apos;hui.
      </p>
    </div>
  );
}
