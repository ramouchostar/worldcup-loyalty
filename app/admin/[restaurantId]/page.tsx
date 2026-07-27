import { createAdminClient } from "@/lib/supabase";
import { createServerSupabaseClient } from "@/lib/supabase";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getRestaurant } from "@/lib/restaurant";

export default async function AdminDashboardPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const r = (path: string) => `/admin/${restaurantId}${path}`;
  const restaurant = await getRestaurant(restaurantId);

  const [
    { count: pendingOrders },
    { count: pendingClaims },
    { count: totalMembers },
    { data: threshold },
    { data: pendingOrdersData },
    { data: validatedAmounts },
    { data: marginItems },
    { data: budgetRows },
  ] = await Promise.all([
    admin.from("orders").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).eq("status", "pending"),
    admin.from("micro_reward_claims").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).eq("status", "pending"),
    // Tous les membres inscrits — l'équipe est optionnelle (ADR 0018), le
    // filtre team_id sous-comptait (audit 2026-07-23).
    admin.from("memberships").select("user_id", { count: "exact", head: true }).eq("restaurant_id", restaurantId),
    admin.from("restaurant_thresholds").select("period_label, current_revenue, target_revenue, is_unlocked").eq("restaurant_id", restaurantId).order("created_at", { ascending: false }).limit(1).single(),
    admin.from("orders").select("flag_reasons").eq("restaurant_id", restaurantId).eq("status", "pending"),
    // Gains du programme (depuis le début) : CA scanné + marge estimée sur
    // les articles reconnus (ADR 0020) + coût réel des cadeaux distribués
    admin.from("orders").select("amount").eq("restaurant_id", restaurantId).eq("status", "validated").limit(10000),
    admin
      .from("order_items")
      .select("quantity, menu_items!inner(menu_price, cost_price), orders!inner(restaurant_id, status)")
      .eq("orders.restaurant_id", restaurantId)
      .eq("orders.status", "validated")
      .limit(10000),
    admin.from("reward_budget_tracking").select("rewards_cost").eq("restaurant_id", restaurantId),
  ]);

  const programRevenue = (validatedAmounts ?? []).reduce((s, o) => s + Number((o as { amount: number }).amount), 0);
  type MarginRow = { quantity: number; menu_items: { menu_price: number; cost_price: number } | { menu_price: number; cost_price: number }[] };
  const programMargin = ((marginItems ?? []) as unknown as MarginRow[]).reduce((s, row) => {
    const mi = Array.isArray(row.menu_items) ? row.menu_items[0] : row.menu_items;
    if (!mi) return s;
    return s + (Number(mi.menu_price) - Number(mi.cost_price)) * (Number(row.quantity) || 1);
  }, 0);
  const rewardsCost = (budgetRows ?? []).reduce((s, r) => s + Number((r as { rewards_cost: number }).rewards_cost), 0);
  const netGain = programMargin - rewardsCost;

  const flaggedCount = (pendingOrdersData ?? []).filter(
    (o: { flag_reasons: string[] | null }) => Array.isArray(o.flag_reasons) && o.flag_reasons.length > 0
  ).length;

  const th = threshold as {
    period_label: string;
    current_revenue: number;
    target_revenue: number;
    is_unlocked: boolean;
  } | null;

  const revenuePct = th
    ? Math.min(100, Math.round((th.current_revenue / th.target_revenue) * 100))
    : 0;

  const stats = [
    {
      href: r("/orders"),
      label: "Commandes suspectes",
      value: flaggedCount,
      icon: "🚩",
      urgent: flaggedCount > 0,
      badge: flaggedCount > 0 ? "Vérifier" : undefined,
    },
    {
      // ?filter=pending : la page ouvre le bon onglet (audit 2026-07-23 —
      // le défaut « flagged » ne correspondait pas au libellé de la carte).
      href: `${r("/orders")}?filter=pending`,
      label: "Commandes en attente",
      value: pendingOrders ?? 0,
      icon: "🧾",
      urgent: (pendingOrders ?? 0) > 0,
      badge: undefined,
    },
    {
      href: r("/micro-rewards"),
      label: "Actions à valider",
      value: pendingClaims ?? 0,
      icon: "⭐",
      urgent: (pendingClaims ?? 0) > 0,
      badge: undefined,
    },
    {
      href: null, // simple compteur → non cliquable (M9 : /broadcast était une destination surprenante)
      label: "Membres inscrits",
      value: totalMembers ?? 0,
      icon: "👥",
      urgent: false,
      badge: undefined,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard Admin</h1>
        <p className="text-gray-500 text-sm mt-1">Vue d&apos;ensemble du programme de fidélité</p>
      </div>

      {/* Établissement pas encore en ligne : guider la fin de l'inscription
          (audit 2026-07-23 — un abandon d'onboarding atterrissait dans une
          console vide sans explication). */}
      {restaurant?.status === "pending" && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4">
          <p className="font-bold text-amber-900 text-sm mb-1">
            ⏳ Ton établissement n&apos;est pas encore visible des clients
          </p>
          <p className="text-xs text-amber-800 mb-3">
            Il sera mis en ligne après validation par notre équipe. En attendant,
            assure-toi d&apos;avoir terminé les 3 étapes de l&apos;inscription :
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href={r("/menu")} className="text-xs font-semibold bg-white border border-amber-300 text-amber-900 px-3 py-1.5 rounded-lg hover:bg-amber-100 transition-colors">
              2/3 · Menu &amp; coûts →
            </Link>
            <Link href={`/become-a-partner/${restaurantId}/receipt`} className="text-xs font-semibold bg-white border border-amber-300 text-amber-900 px-3 py-1.5 rounded-lg hover:bg-amber-100 transition-colors">
              3/3 · Configurer le ticket de caisse →
            </Link>
          </div>
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {stats.map((s, i) => {
          const cls = `bg-white rounded-2xl border p-4 transition-shadow ${s.href ? "hover:shadow-md" : ""} ${
            s.icon === "🚩" && s.urgent
              ? "border-red-400 bg-red-50"
              : s.urgent ? "border-amber-300" : "border-gray-100"
          }`;
          const inner = (
            <>
              <div className="flex items-start justify-between">
                <span className="text-2xl">{s.icon}</span>
                {s.badge && (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    s.icon === "🚩" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                  }`}>
                    {s.badge}
                  </span>
                )}
                {s.urgent && !s.badge && (
                  <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2 py-0.5 rounded-full">
                    Action
                  </span>
                )}
              </div>
              <p className={`text-3xl font-black mt-2 ${s.icon === "🚩" && s.urgent ? "text-red-700" : "text-gray-900"}`}>
                {s.value}
              </p>
              <p className="text-xs text-gray-500 mt-0.5 leading-tight">{s.label}</p>
            </>
          );
          return s.href ? (
            <Link key={`${s.label}-${i}`} href={s.href} className={cls}>{inner}</Link>
          ) : (
            <div key={`${s.label}-${i}`} className={cls}>{inner}</div>
          );
        })}
      </div>

      {/* Gains du programme — depuis le début */}
      <div className="bg-gradient-to-br from-brand-dark to-gray-800 text-white rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold">💰 Ce que le programme t&apos;a rapporté</h2>
          <Link href={r("/sales")} className="text-xs text-brand-gold hover:underline">Détail par plat →</Link>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-2xl font-black tabular-nums">
              {programRevenue.toLocaleString("fr-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
            </p>
            <p className="text-xs text-gray-400 mt-1">CA généré (tickets scannés)</p>
          </div>
          <div>
            <p className="text-2xl font-black tabular-nums text-brand-gold">
              {programMargin.toLocaleString("fr-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
            </p>
            <p className="text-xs text-gray-400 mt-1">marge sur articles reconnus</p>
          </div>
          <div>
            <p className={`text-2xl font-black tabular-nums ${netGain >= 0 ? "text-green-400" : "text-red-400"}`}>
              {netGain.toLocaleString("fr-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              gain net estimé (marge − {rewardsCost.toLocaleString("fr-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })} de cadeaux)
            </p>
          </div>
        </div>
      </div>

      {/* Statut CA restaurant */}
      {th && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-900">Objectif CA — {th.period_label}</h2>
            <Link href={r("/thresholds")} className="text-brand-red text-sm font-medium hover:underline">
              Gérer →
            </Link>
          </div>
          <div className="flex items-center gap-3 mb-3">
            <span className={`px-3 py-1 rounded-full text-sm font-bold ${
              th.is_unlocked ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
            }`}>
              {th.is_unlocked ? "🔓 Débloqué" : "🔒 Verrouillé"}
            </span>
            <span className="text-sm text-gray-600">
              {Number(th.current_revenue).toLocaleString("fr-BE", { style: "currency", currency: "EUR" })}
              {" / "}
              {Number(th.target_revenue).toLocaleString("fr-BE", { style: "currency", currency: "EUR" })}
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3">
            <div
              className={`h-3 rounded-full transition-all ${th.is_unlocked ? "bg-green-500" : "bg-brand-red"}`}
              style={{ width: `${revenuePct}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1 text-right">{revenuePct}% de l&apos;objectif</p>
        </div>
      )}

      {/* Liens rapides */}
      <div className="grid grid-cols-2 gap-3">
        <Link href={r("/team-tiers")} className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-sm transition-shadow">
          <p className="font-semibold text-gray-900 text-sm">🏆 Paliers d&apos;équipe</p>
          <p className="text-xs text-gray-400 mt-0.5">Récompenses collectives</p>
        </Link>
        <Link href={`/r/${restaurantId}/leaderboard`} className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-sm transition-shadow" target="_blank">
          <p className="font-semibold text-gray-900 text-sm">🏆 Classement public</p>
          <p className="text-xs text-gray-400 mt-0.5">Vue temps réel ↗</p>
        </Link>
        <Link href={r("/sales")} className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-sm transition-shadow">
          <p className="font-semibold text-gray-900 text-sm">📊 Ventes par plat</p>
          <p className="text-xs text-gray-400 mt-0.5">Quantités, CA, marges, heures</p>
        </Link>
        <Link href={r("/insights")} className="bg-white rounded-xl border border-brand-gold/40 p-4 hover:shadow-sm transition-shadow">
          <p className="font-semibold text-gray-900 text-sm">💡 Opportunités</p>
          <p className="text-xs text-gray-400 mt-0.5">Promos &amp; combos suggérés</p>
        </Link>
        <Link href={r("/qr")} className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-sm transition-shadow">
          <p className="font-semibold text-gray-900 text-sm">📱 QR code</p>
          <p className="text-xs text-gray-400 mt-0.5">À imprimer pour tes clients</p>
        </Link>
        <Link href={r("/settings")} className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-sm transition-shadow">
          <p className="font-semibold text-gray-900 text-sm">🏪 Mon établissement</p>
          <p className="text-xs text-gray-400 mt-0.5">Infos &amp; liens sociaux</p>
        </Link>
      </div>
    </div>
  );
}
