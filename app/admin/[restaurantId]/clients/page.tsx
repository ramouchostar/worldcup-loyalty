import { createAdminClient } from "@/lib/supabase";
import { fetchAllRowsStrict, type PageResult } from "@/lib/paged-select";
import { ClientsTable, type ClientRow } from "@/components/admin/ClientsTable";
import { getAppInstallsByUser } from "@/lib/app-install";
import { PageHeader } from "@/components/admin/ui";

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

  // Lectures PAGINÉES : PostgREST tronque en silence à 1 000 lignes (lib/paged-select.ts), et
  // une liste de clients ou une dépense par membre sur un échantillon seraient fausses sans le dire.
  const [memberships, orders] = await Promise.all([
    fetchAllRowsStrict<MembershipRow>("Mes clients : adhésions", (from, to) =>
      admin
        .from("memberships")
        .select("user_id, joined_at, profiles!inner(display_name), teams(name, flag_emoji)")
        .eq("restaurant_id", restaurantId)
        .order("user_id")
        // Relation 1-1 que l'inférence de Supabase type en tableau : on garde le typage voulu (`MembershipRow`).
        .range(from, to) as unknown as PromiseLike<PageResult<MembershipRow>>
    ),
    fetchAllRowsStrict<OrderRow>("Mes clients : tickets", (from, to) =>
      admin
        .from("orders")
        .select("user_id, amount, order_date")
        .eq("restaurant_id", restaurantId)
        .eq("status", "validated")
        .order("id")
        .range(from, to)
    ),
  ]);
  // App installée (complément ADR 0038) — indicateur pseudonymisé, fail-open.
  const installs = await getAppInstallsByUser(memberships.map((m) => m.user_id));

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
        appInstalled: installs.has(m.user_id),
        _sort: agg?.last ?? m.joined_at,
      };
    })
    .sort((a, b) => (b._sort > a._sort ? 1 : -1))
    .map(({ _sort, ...row }) => row);

  return (
    <div className="space-y-5">
      <PageHeader
        title={<>Mes clients</>}
        subtitle={<>L&apos;activité de tes membres — {memberships.length} inscrit
          {memberships.length > 1 ? "s" : ""}, dont {installs.size} avec l&apos;app installée.
          Les coordonnées restent gérées par la plateforme (RGPD) : pour les joindre, passe par
          les Broadcasts.</>}
      />

      <ClientsTable rows={rows} />
    </div>
  );
}
