import { redirect } from "next/navigation";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { approveRestaurant, rejectRestaurant } from "./actions";

export default async function PlatformPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  if (!profile?.is_super_admin) redirect("/join");

  const admin = createAdminClient();

  const [{ data: pending }, { count: activeCount }, { count: memberCount }] = await Promise.all([
    admin.from("restaurants").select("id, name, sector, created_at").eq("status", "pending").order("created_at"),
    admin.from("restaurants").select("id", { count: "exact", head: true }).eq("status", "active"),
    admin.from("memberships").select("user_id", { count: "exact", head: true }),
  ]);

  const pendingList = pending ?? [];
  const menuCounts = await Promise.all(
    pendingList.map((r) =>
      admin.from("menu_items").select("id", { count: "exact", head: true }).eq("restaurant_id", r.id)
    )
  );

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Console plateforme</h1>
          <p className="text-gray-500 text-sm mt-1">Validation des établissements et stats réseau.</p>
        </div>

        {/* Stats cross-établissements — argument commercial ADR 0015 §9 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
            <p className="text-3xl font-bold text-gray-900">{activeCount ?? 0}</p>
            <p className="text-xs text-gray-500 mt-1">établissements actifs</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
            <p className="text-3xl font-bold text-brand-red">{memberCount ?? 0}</p>
            <p className="text-xs text-gray-500 mt-1">adhésions réseau</p>
          </div>
        </div>

        {/* File d'approbation */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-bold text-gray-900 mb-4">
            En attente de validation
            {pendingList.length > 0 && (
              <span className="ml-2 bg-brand-red text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {pendingList.length}
              </span>
            )}
          </h2>

          {pendingList.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Aucun établissement en attente.</p>
          ) : (
            <div className="space-y-3">
              {pendingList.map((r, idx) => (
                <div key={r.id} className="border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-semibold text-gray-900">
                        {r.name}
                        {r.sector && <span className="ml-2 text-xs font-normal text-gray-400">📍 {r.sector}</span>}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(r.created_at).toLocaleDateString("fr-BE", { day: "numeric", month: "short", year: "numeric" })}
                        {" · "}
                        {menuCounts[idx].count ?? 0} article{(menuCounts[idx].count ?? 0) > 1 ? "s" : ""} au catalogue
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <form action={approveRestaurant.bind(null, r.id)}>
                      <button
                        type="submit"
                        className="bg-green-600 text-white text-sm font-semibold px-4 py-1.5 rounded-lg hover:bg-green-700 transition-colors"
                      >
                        Approuver
                      </button>
                    </form>
                    <form action={rejectRestaurant.bind(null, r.id)}>
                      <button
                        type="submit"
                        className="bg-gray-100 text-gray-700 text-sm font-semibold px-4 py-1.5 rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        Rejeter
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
