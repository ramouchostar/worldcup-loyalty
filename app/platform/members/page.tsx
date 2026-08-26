import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { MembersTable, type MemberRow } from "@/components/admin/MembersTable";
import { getAppInstallsByUser, PLATFORM_LABEL } from "@/lib/app-install";
import { fetchAllRows } from "@/lib/paged-select";

export const metadata = { title: "Membres — Plateforme" };

type MembershipRow = {
  user_id: string;
  restaurant_id: string;
  joined_at: string;
  profiles: { display_name: string | null; email: string | null } | null;
  teams: { name: string; flag_emoji: string } | null;
};

type OrderRow = { user_id: string; restaurant_id: string; order_date: string };

const LIST_LIMIT = 500;

// ADR 0030 §7 — « Membres » : liste nominative complète du réseau, réservée
// au super-admin (ADR 0025 : la plateforme est l'unique responsable de
// traitement). Filtrable par établissement (`?restaurant=`) — c'est le lien
// « Membres » du bandeau Mode plateforme.
export default async function PlatformMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ restaurant?: string }>;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  if (!profile?.is_super_admin) redirect("/join?reason=platform-required");

  const { restaurant: restaurantFilter } = await searchParams;
  const admin = createAdminClient();

  let membershipQuery = admin
    .from("memberships")
    .select("user_id, restaurant_id, joined_at, profiles!inner(display_name, email), teams(name, flag_emoji)")
    .order("joined_at", { ascending: false })
    .limit(LIST_LIMIT);
  if (restaurantFilter) membershipQuery = membershipQuery.eq("restaurant_id", restaurantFilter);

  const [{ data: membershipsRaw }, { data: restaurantsRaw }] = await Promise.all([
    membershipQuery,
    admin.from("restaurants").select("id, name"),
  ]);

  const memberships = (membershipsRaw as unknown as MembershipRow[]) ?? [];
  const restaurantNames = new Map(
    (((restaurantsRaw as { id: string; name: string }[] | null) ?? [])).map((r) => [r.id, r.name])
  );

  // Agrégats commandes (nb + dernière) par couple membre × établissement.
  const userIds = Array.from(new Set(memberships.map((m) => m.user_id)));
  // App installée (complément ADR 0038) — fail-open si la migration manque.
  const installs = await getAppInstallsByUser(userIds);

  // `.in("user_id", userIds)` avec jusqu'à 500 ids d'un coup + `.limit(20000)`
  // qui ne protège de rien (PostgREST tronque en silence à `max_rows`, 1000
  // par défaut — lib/paged-select.ts) : par lots ET paginé, comme le reste de
  // la console plateforme. Erreur explicite au lieu de zéros silencieux.
  const USER_BATCH = 200;
  let orders: OrderRow[] = [];
  let ordersError: string | null = null;
  try {
    for (let i = 0; i < userIds.length; i += USER_BATCH) {
      const batchIds = userIds.slice(i, i + USER_BATCH);
      const { rows } = await fetchAllRows<OrderRow>((from, to) => {
        let q = admin
          .from("orders")
          .select("user_id, restaurant_id, order_date")
          .eq("status", "validated")
          .in("user_id", batchIds)
          .range(from, to);
        if (restaurantFilter) q = q.eq("restaurant_id", restaurantFilter);
        return q;
      });
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
    return {
      name: m.profiles?.display_name ?? "Membre",
      email: m.profiles?.email ?? null,
      restaurant: restaurantNames.get(m.restaurant_id) ?? m.restaurant_id,
      team: m.teams ? `${m.teams.flag_emoji} ${m.teams.name}` : null,
      joined: fmt(m.joined_at) ?? "—",
      orderCount: agg?.count ?? 0,
      lastActivity: fmt(agg?.last ?? null),
      app: (() => {
        const inst = installs.get(m.user_id);
        return inst ? `${PLATFORM_LABEL[inst.platform] ?? inst.platform} · depuis le ${fmt(inst.installed_at)}` : null;
      })(),
    };
  });

  const filterName = restaurantFilter ? restaurantNames.get(restaurantFilter) : null;

  return (
    <div className="max-w-3xl mx-auto space-y-5 py-8 px-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Membres</h1>
        <p className="text-gray-500 text-sm mt-1">
          {filterName ? (
            <>
              Membres de « {filterName} » —{" "}
              <Link href="/platform/members" className="text-brand-red font-semibold hover:underline">
                voir tout le réseau
              </Link>
            </>
          ) : (
            <>Les {memberships.length >= LIST_LIMIT ? `${LIST_LIMIT} dernières adhésions` : "adhésions"} du réseau, tous établissements confondus — comptes démo compris.</>
          )}
        </p>
      </div>

      {ordersError && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-900">
          <p className="font-semibold">Volume de commandes indisponible</p>
          <p className="text-red-700 text-xs mt-0.5">
            La liste des membres s&apos;affiche mais le nombre de tickets et la dernière activité n&apos;ont
            pas pu être calculés. Message : <span className="font-mono">{ordersError}</span>
          </p>
        </div>
      )}

      <MembersTable rows={rows} />
    </div>
  );
}
