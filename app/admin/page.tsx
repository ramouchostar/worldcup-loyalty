import { createAdminClient } from "@/lib/supabase";
import { createServerSupabaseClient } from "@/lib/supabase";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function AdminDashboardPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const [
    { count: pendingOrders },
    { count: pendingClaims },
    { count: totalMembers },
    { data: threshold },
  ] = await Promise.all([
    admin.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("micro_reward_claims").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("profiles").select("id", { count: "exact", head: true }).not("team_id", "is", null),
    admin.from("restaurant_thresholds").select("period_label, current_revenue, target_revenue, is_unlocked").order("created_at", { ascending: false }).limit(1).single(),
  ]);

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
      href: "/admin/orders",
      label: "Commandes en attente",
      value: pendingOrders ?? 0,
      icon: "🧾",
      urgent: (pendingOrders ?? 0) > 0,
    },
    {
      href: "/admin/micro-rewards",
      label: "Actions à valider",
      value: pendingClaims ?? 0,
      icon: "⭐",
      urgent: (pendingClaims ?? 0) > 0,
    },
    {
      href: "/admin/teams",
      label: "Membres inscrits",
      value: totalMembers ?? 0,
      icon: "👥",
      urgent: false,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard Admin</h1>
        <p className="text-gray-500 text-sm mt-1">Vue d&apos;ensemble du programme WorldCup</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className={`bg-white rounded-2xl border p-5 hover:shadow-md transition-shadow ${
              s.urgent ? "border-amber-300" : "border-gray-100"
            }`}
          >
            <div className="flex items-start justify-between">
              <span className="text-3xl">{s.icon}</span>
              {s.urgent && (
                <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2 py-0.5 rounded-full">
                  Action requise
                </span>
              )}
            </div>
            <p className="text-3xl font-black text-gray-900 mt-3">{s.value}</p>
            <p className="text-sm text-gray-500 mt-0.5">{s.label}</p>
          </Link>
        ))}
      </div>

      {/* Statut CA restaurant */}
      {th && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-900">Objectif CA — {th.period_label}</h2>
            <Link href="/admin/thresholds" className="text-brand-red text-sm font-medium hover:underline">
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
        <Link href="/admin/teams" className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-sm transition-shadow">
          <p className="font-semibold text-gray-900 text-sm">🏴 Gérer les équipes</p>
          <p className="text-xs text-gray-400 mt-0.5">Éliminer, avancer au tour suivant</p>
        </Link>
        <Link href="/leaderboard" className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-sm transition-shadow" target="_blank">
          <p className="font-semibold text-gray-900 text-sm">🏆 Classement public</p>
          <p className="text-xs text-gray-400 mt-0.5">Vue temps réel ↗</p>
        </Link>
      </div>
    </div>
  );
}
