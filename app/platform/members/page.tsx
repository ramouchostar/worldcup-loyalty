import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { MembersTable, type MemberRow } from "@/components/admin/MembersTable";

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
  let orders: OrderRow[] = [];
  if (userIds.length > 0) {
    let ordersQuery = admin
      .from("orders")
      .select("user_id, restaurant_id, order_date")
      .eq("status", "validated")
      .in("user_id", userIds)
      .limit(20000);
    if (restaurantFilter) ordersQuery = ordersQuery.eq("restaurant_id", restaurantFilter);
    const { data: ordersRaw } = await ordersQuery;
    orders = (ordersRaw as OrderRow[] | null) ?? [];
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
    };
  });

  const filterName = restaurantFilter ? restaurantNames.get(restaurantFilter) : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-brand-dark text-white shadow-md sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <span className="text-brand-gold font-black text-lg">🛠️ Plateforme</span>
          <Link href="/platform" className="text-xs text-gray-400 hover:text-white transition-colors">
            ← Retour à la plateforme
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto space-y-5 py-8 px-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">👥 Membres</h1>
          <p className="text-gray-500 text-sm mt-1">
            {filterName ? (
              <>
                Membres de « {filterName} » —{" "}
                <Link href="/platform/members" className="text-brand-red font-semibold hover:underline">
                  voir tout le réseau
                </Link>
              </>
            ) : (
              <>Les {memberships.length >= LIST_LIMIT ? `${LIST_LIMIT} dernières adhésions` : "adhésions"} du réseau, tous établissements confondus.</>
            )}
          </p>
        </div>

        <MembersTable rows={rows} />
      </div>
    </div>
  );
}
