import { createAdminClient } from "@/lib/supabase";
import { ClientsTable, type ClientRow } from "@/components/admin/ClientsTable";

export const metadata = { title: "Mes clients" };

type MembershipRow = {
  user_id: string;
  joined_at: string;
  profiles: { display_name: string | null } | null;
  teams: { name: string; flag_emoji: string } | null;
};

type OrderRow = { user_id: string; amount: number; order_date: string };

// ADR 0030 §7 — « Mes clients » : liste d'activité pseudonymisée de
// l'établissement. Le nom d'affichage oui (nécessité opérationnelle, comme
// sur Commandes/Cadeaux), les coordonnées JAMAIS (ADR 0025 : l'éditeur est
// l'unique responsable de traitement ; le resto agit via le ciblage-service).
// La garde est assurée par le layout admin.
export default async function ClientsPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const admin = createAdminClient();

  const [{ data: membershipsRaw }, { data: ordersRaw }] = await Promise.all([
    admin
      .from("memberships")
      .select("user_id, joined_at, profiles!inner(display_name), teams(name, flag_emoji)")
      .eq("restaurant_id", restaurantId),
    admin
      .from("orders")
      .select("user_id, amount, order_date")
      .eq("restaurant_id", restaurantId)
      .eq("status", "validated")
      .limit(10000),
  ]);

  const memberships = (membershipsRaw as unknown as MembershipRow[]) ?? [];
  const orders = ((ordersRaw as OrderRow[] | null) ?? []);

  const byUser = new Map<string, { count: number; spent: number; last: string | null }>();
  for (const o of orders) {
    const agg = byUser.get(o.user_id) ?? { count: 0, spent: 0, last: null };
    agg.count += 1;
    agg.spent += Number(o.amount);
    if (!agg.last || o.order_date > agg.last) agg.last = o.order_date;
    byUser.set(o.user_id, agg);
  }

  const fmt = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString("fr-BE", { day: "numeric", month: "short", year: "numeric" })
      : null;

  const rows: ClientRow[] = memberships
    .map((m) => {
      const agg = byUser.get(m.user_id);
      return {
        name: m.profiles?.display_name ?? "Membre",
        team: m.teams ? `${m.teams.flag_emoji} ${m.teams.name}` : null,
        orderCount: agg?.count ?? 0,
        totalSpent: agg?.spent ?? 0,
        lastVisit: fmt(agg?.last ?? null),
        _sort: agg?.last ?? m.joined_at,
      };
    })
    .sort((a, b) => (b._sort > a._sort ? 1 : -1))
    .map(({ _sort, ...row }) => row);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">👤 Mes clients</h1>
        <p className="text-gray-500 text-sm mt-1">
          L&apos;activité de tes membres — {memberships.length} inscrit
          {memberships.length > 1 ? "s" : ""}. Les coordonnées restent gérées par la
          plateforme (RGPD) : pour les joindre, passe par les Broadcasts.
        </p>
      </div>

      <ClientsTable rows={rows} />
    </div>
  );
}
