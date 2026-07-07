import { createAdminClient } from "@/lib/supabase";
import { createServerSupabaseClient } from "@/lib/supabase";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function AdminDashboardPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const r = (path: string) => `/admin/${restaurantId}${path}`;

  const [
    { count: pendingOrders },
    { count: pendingClaims },
    { count: totalMembers },
    { data: threshold },
    { data: pendingOrdersData },
  ] = await Promise.all([
    admin.from("orders").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).eq("status", "pending"),
    admin.from("micro_reward_claims").select("id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).eq("status", "pending"),
    admin.from("memberships").select("user_id", { count: "exact", head: true }).eq("restaurant_id", restaurantId).not("team_id", "is", null),
    admin.from("restaurant_thresholds").select("period_label, current_revenue, target_revenue, is_unlocked").eq("restaurant_id", restaurantId).order("created_at", { ascending: false }).limit(1).single(),
    admin.from("orders").select("flag_reasons").eq("restaurant_id", restaurantId).eq("status", "pending"),
  ]);

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
      href: r("/orders"),
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
      href: r("/broadcast"),
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

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {stats.map((s, i) => (
          <Link
            key={`${s.href}-${i}`}
            href={s.href}
            className={`bg-white rounded-2xl border p-4 hover:shadow-md transition-shadow ${
              s.icon === "🚩" && s.urgent
                ? "border-red-400 bg-red-50"
                : s.urgent ? "border-amber-300" : "border-gray-100"
            }`}
          >
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
          </Link>
        ))}
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
