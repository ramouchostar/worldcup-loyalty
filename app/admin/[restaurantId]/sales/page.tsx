import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { isEstablishmentAdmin } from "@/lib/admin-guard";
import { getEntitlement, ensureTrialStarted } from "@/lib/entitlements";
import { PaywallSection, TrialBanner } from "@/components/admin/Paywall";

// Ventes par plat (ADR 0020) — agrégats des lignes d'articles lues sur les
// tickets scannés par les membres. Surface admin uniquement : les euros et
// coûts de revient n'apparaissent jamais côté client (ADR 0007).
//
// Limite assumée : on ne voit que les commandes passées PAR le programme
// (tickets scannés), pas toute la caisse — c'est justement la vue « ce que
// le programme me rapporte ».

const euro = (n: number) =>
  Number(n).toLocaleString("fr-BE", { style: "currency", currency: "EUR" });

const PERIODS = [
  { days: 7, label: "7 jours" },
  { days: 30, label: "30 jours" },
  { days: 90, label: "90 jours" },
  { days: 365, label: "1 an" },
];

const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

type OrderRow = { id: string; order_date: string; order_time: string | null; amount: number };
type ItemRow = { order_id: string; raw_name: string; quantity: number; unit_price: number | null; menu_item_id: string | null };
type MenuRow = { id: string; name: string; menu_price: number; cost_price: number };

type DishAgg = {
  name: string;
  matched: boolean;
  qty: number;
  revenue: number;
  margin: number | null; // null = article hors catalogue, coût inconnu
};

export default async function AdminSalesPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantId: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  const { restaurantId } = await params;
  const { days: rawDays } = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!(await isEstablishmentAdmin(user.id, restaurantId))) redirect("/join");

  // ADR 0029 §5 — « Ventes par plat » = analytique établissement (Croissance).
  // Essai à la 1re visite avec de la donnée ; paywall doux ensuite.
  const days = PERIODS.some((p) => p.days === Number(rawDays))
    ? Number(rawDays)
    : 30;
  const startDate = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

  const admin = createAdminClient();

  const [{ data: ordersRaw }, { data: menuRaw }] = await Promise.all([
    admin
      .from("orders")
      .select("id, order_date, order_time, amount")
      .eq("restaurant_id", restaurantId)
      .eq("status", "validated")
      .gte("order_date", startDate)
      .limit(5000),
    admin.from("menu_items").select("id, name, menu_price, cost_price").eq("restaurant_id", restaurantId),
  ]);

  const orders = (ordersRaw ?? []) as OrderRow[];
  const menuById = new Map(((menuRaw ?? []) as MenuRow[]).map((m) => [m.id, m]));

  // Lignes d'articles des commandes de la période (par lots — .in() borné)
  const items: ItemRow[] = [];
  const orderIds = orders.map((o) => o.id);
  for (let i = 0; i < orderIds.length; i += 150) {
    const { data: chunk } = await admin
      .from("order_items")
      .select("order_id, raw_name, quantity, unit_price, menu_item_id")
      .in("order_id", orderIds.slice(i, i + 150));
    items.push(...((chunk ?? []) as ItemRow[]));
  }

  // ── Agrégats par plat ──────────────────────────────────────────────────────
  const orderById = new Map(orders.map((o) => [o.id, o]));
  const dishes = new Map<string, DishAgg>();

  for (const it of items) {
    const qty = Number(it.quantity) || 1;
    const mi = it.menu_item_id ? menuById.get(it.menu_item_id) : undefined;
    const key = mi ? mi.id : `raw:${it.raw_name.trim().toLowerCase()}`;
    const existing = dishes.get(key) ?? {
      name: mi ? mi.name : it.raw_name,
      matched: !!mi,
      qty: 0,
      revenue: 0,
      margin: mi ? 0 : null,
    };
    existing.qty += qty;
    if (mi) {
      // Prix et coût du CATALOGUE — plus fiables que la lecture OCR du ticket
      existing.revenue += Number(mi.menu_price) * qty;
      existing.margin = (existing.margin ?? 0) + (Number(mi.menu_price) - Number(mi.cost_price)) * qty;
    } else {
      existing.revenue += Number(it.unit_price ?? 0);
    }
    dishes.set(key, existing);
  }

  const dishList = Array.from(dishes.values()).sort(
    (a, b) => (b.margin ?? -1) - (a.margin ?? -1) || b.revenue - a.revenue
  );
  const maxQty = Math.max(1, ...dishList.map((d) => d.qty));

  // ── Ventes par heure et par jour de semaine ────────────────────────────────
  const byHour = new Array<number>(24).fill(0);
  const byWeekday = new Array<number>(7).fill(0);
  for (const it of items) {
    const order = orderById.get(it.order_id);
    if (!order) continue;
    const qty = Number(it.quantity) || 1;
    if (order.order_time) {
      const h = parseInt(order.order_time.slice(0, 2), 10);
      if (h >= 0 && h < 24) byHour[h] += qty;
    }
    // getUTCDay : 0 = dimanche → index 6 de WEEKDAYS (Lun..Dim)
    const wd = (new Date(`${order.order_date}T00:00:00Z`).getUTCDay() + 6) % 7;
    byWeekday[wd] += qty;
  }
  const maxHour = Math.max(1, ...byHour);
  const maxWeekday = Math.max(1, ...byWeekday);

  const totalRevenue = orders.reduce((s, o) => s + Number(o.amount), 0);
  const totalItems = dishList.reduce((s, d) => s + d.qty, 0);
  const totalMargin = dishList.reduce((s, d) => s + (d.margin ?? 0), 0);
  const withTime = orders.filter((o) => o.order_time).length;

  const r = (d: number) => `/admin/${restaurantId}/sales?days=${d}`;

  if (orders.length > 0) await ensureTrialStarted(restaurantId, "sales");
  const ent = await getEntitlement(restaurantId, "sales");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ventes par plat</h1>
          <p className="text-gray-500 text-sm mt-1">
            Ce que les commandes du programme te rapportent, plat par plat —
            calculé sur les tickets scannés par tes membres.
          </p>
        </div>
        <div className="flex gap-1.5">
          {PERIODS.map((p) => (
            <Link
              key={p.days}
              href={r(p.days)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                p.days === days
                  ? "bg-brand-dark text-white"
                  : "bg-white border border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              {p.label}
            </Link>
          ))}
        </div>
      </div>

      <TrialBanner ent={ent} restaurantId={restaurantId} feature="sales" />

      <PaywallSection
        ent={ent}
        restaurantId={restaurantId}
        feature="sales"
        title="Débloque tes ventes par plat"
        pitch="CA, marge et volume plat par plat, heures et jours forts — calculés sur les tickets de tes membres. Passe au plan Croissance pour les consulter."
      >
      <div className="space-y-6">
      {/* Totaux de la période */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
          <p className="text-2xl font-black text-gray-900">{orders.length}</p>
          <p className="text-xs text-gray-500 mt-1">commandes validées</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
          <p className="text-2xl font-black text-gray-900">{euro(totalRevenue)}</p>
          <p className="text-xs text-gray-500 mt-1">CA scanné</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
          <p className="text-2xl font-black text-gray-900">{totalItems}</p>
          <p className="text-xs text-gray-500 mt-1">articles vendus</p>
        </div>
        <div className="bg-white rounded-2xl border border-green-200 bg-green-50 p-4 text-center">
          <p className="text-2xl font-black text-green-700">{euro(totalMargin)}</p>
          <p className="text-xs text-green-700 mt-1">marge sur articles reconnus</p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
          Aucun article détaillé sur la période. Les détails de plats sont lus
          sur les tickets scannés depuis début juillet 2026 — ils
          s&apos;accumuleront au fil des commandes de tes membres.
        </div>
      ) : (
        <>
          {/* Performance par plat */}
          {/* overflow-x-auto + min-w : la table scrolle sur téléphone au lieu
              de s'écraser (audit 2026-07-23) */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
            <div className="px-4 pt-4 pb-2">
              <h2 className="font-bold text-gray-900">Performance par plat</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Prix et coûts du catalogue × quantités lues sur les tickets.
                Triés par marge totale.
              </p>
            </div>
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5">Plat</th>
                  <th className="text-right font-medium px-4 py-2.5">Qté</th>
                  <th className="text-right font-medium px-4 py-2.5">CA</th>
                  <th className="text-right font-medium px-4 py-2.5" title="(prix vente − prix revient) × quantité">
                    Marge
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {dishList.map((d, idx) => (
                  <tr key={`${d.name}-${idx}`}>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-gray-900">
                        {d.name}
                        {!d.matched && (
                          <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full" title="Lu sur le ticket mais absent du catalogue — ajoute-le à ton CSV pour suivre sa marge">
                            hors catalogue
                          </span>
                        )}
                      </div>
                      <div className="mt-1 w-full bg-gray-100 rounded-full h-1.5 max-w-[240px]">
                        <div
                          className="bg-brand-red h-1.5 rounded-full"
                          style={{ width: `${Math.round((d.qty / maxQty) * 100)}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-900 align-top">{d.qty}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700 align-top">{euro(d.revenue)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums align-top">
                      {d.margin !== null ? (
                        <span className="font-semibold text-green-700">{euro(d.margin)}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Par heure / par jour */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h2 className="font-bold text-gray-900 mb-1">Articles vendus par heure</h2>
              <p className="text-xs text-gray-400 mb-4">
                Heure imprimée sur le ticket ({withTime}/{orders.length} commandes datées).
              </p>
              <div className="flex items-end gap-0.5 h-28">
                {byHour.map((v, h) => (
                  <div key={h} className="flex-1 flex flex-col items-center justify-end h-full" title={`${h}h : ${v} article${v > 1 ? "s" : ""}`}>
                    <div
                      className={`w-full rounded-t ${v > 0 ? "bg-brand-red" : "bg-gray-100"}`}
                      style={{ height: `${Math.max(v > 0 ? 6 : 2, Math.round((v / maxHour) * 100))}%` }}
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                <span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h2 className="font-bold text-gray-900 mb-1">Articles vendus par jour</h2>
              <p className="text-xs text-gray-400 mb-4">Cumul par jour de la semaine sur la période.</p>
              <div className="flex items-end gap-2 h-28">
                {byWeekday.map((v, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end h-full" title={`${WEEKDAYS[i]} : ${v} article${v > 1 ? "s" : ""}`}>
                    <div
                      className={`w-full rounded-t ${v > 0 ? "bg-brand-dark" : "bg-gray-100"}`}
                      style={{ height: `${Math.max(v > 0 ? 6 : 2, Math.round((v / maxWeekday) * 100))}%` }}
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                {WEEKDAYS.map((d) => <span key={d} className="flex-1 text-center">{d}</span>)}
              </div>
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-500 space-y-1">
            <p>
              💡 Ces chiffres couvrent uniquement les commandes <span className="font-semibold">scannées par tes membres</span> —
              c&apos;est la vue « ce que le programme me rapporte », pas ta caisse complète.
            </p>
            <p>
              💡 La lecture des plats sur les tickets est automatique et prudente : un plat
              « hors catalogue » est un libellé lu sur le ticket qui ne correspond à aucun article
              de ton CSV — ajoute-le à ton catalogue pour suivre sa marge.
            </p>
          </div>
        </>
      )}
      </div>
      </PaywallSection>
    </div>
  );
}
