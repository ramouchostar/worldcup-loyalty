import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { approveRestaurant, rejectRestaurant, setRestaurantStatus } from "./actions";
import { CreateRestaurantForm } from "./CreateRestaurantForm";
import { AssignOwnerForm } from "./AssignOwnerForm";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";

type RestaurantRow = {
  id: string;
  name: string;
  sector: string | null;
  status: "pending" | "active" | "disabled";
  owner_id: string | null;
  created_at: string;
};

const STATUS_BADGE: Record<RestaurantRow["status"], { label: string; cls: string }> = {
  active:   { label: "Actif",      cls: "bg-green-100 text-green-800" },
  pending:  { label: "En attente", cls: "bg-amber-100 text-amber-800" },
  disabled: { label: "Désactivé",  cls: "bg-gray-100 text-gray-500" },
};

export default async function PlatformPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  if (!profile?.is_super_admin) redirect("/join");

  const admin = createAdminClient();

  const [{ data: allRaw }, { count: memberCount }, { data: myMembership }] = await Promise.all([
    admin
      .from("restaurants")
      .select("id, name, sector, status, owner_id, created_at")
      .order("created_at", { ascending: false }),
    admin.from("memberships").select("user_id", { count: "exact", head: true }),
    // ADR 0030 §2 — sortie de la console : retour vers l'app membre (dernier
    // établissement rejoint), /join si le super-admin n'est membre nulle part.
    supabase
      .from("memberships")
      .select("restaurant_id")
      .eq("user_id", user.id)
      .order("joined_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const backHref = myMembership ? `/r/${myMembership.restaurant_id}/dashboard` : "/join";

  const all = (allRaw ?? []) as RestaurantRow[];
  const pendingList = all.filter((r) => r.status === "pending");
  const activeCount = all.filter((r) => r.status === "active").length;

  // Emails des owners + compteurs par établissement (réseau petit — les
  // requêtes parallèles suffisent largement)
  const ownerIds = Array.from(new Set(all.map((r) => r.owner_id).filter((id): id is string => !!id)));
  const [{ data: owners }, memberCounts, menuCounts] = await Promise.all([
    ownerIds.length > 0
      ? admin.from("profiles").select("id, email").in("id", ownerIds)
      : Promise.resolve({ data: [] }),
    Promise.all(
      all.map((r) =>
        admin.from("memberships").select("user_id", { count: "exact", head: true }).eq("restaurant_id", r.id)
      )
    ),
    Promise.all(
      pendingList.map((r) =>
        admin.from("menu_items").select("id", { count: "exact", head: true }).eq("restaurant_id", r.id)
      )
    ),
  ]);
  const ownerEmailById = new Map(
    ((owners ?? []) as { id: string; email: string | null }[]).map((o) => [o.id, o.email])
  );
  const membersById = new Map(all.map((r, i) => [r.id, memberCounts[i].count ?? 0]));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header de sortie (ADR 0030 §2 — /platform était une impasse totale) */}
      <header className="bg-brand-dark text-white shadow-md sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <span className="text-brand-gold font-black text-lg">🛠️ Plateforme</span>
          <div className="flex items-center gap-3">
            <Link href={backHref} className="text-xs text-gray-400 hover:text-white transition-colors">
              ← Retour à l&apos;app
            </Link>
            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-white/10 transition-colors"
              >
                Déco
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto space-y-6 py-8 px-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Console plateforme</h1>
          <p className="text-gray-500 text-sm mt-1">Validation des établissements et stats réseau.</p>
        </div>

        {/* Stats cross-établissements — argument commercial ADR 0015 §9 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
            <p className="text-3xl font-bold text-gray-900">{activeCount}</p>
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
                      <ConfirmSubmitButton
                        confirmMessage={`Rejeter « ${r.name} » ? L'établissement sera désactivé.`}
                        className="bg-gray-100 text-gray-700 text-sm font-semibold px-4 py-1.5 rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        Rejeter
                      </ConfirmSubmitButton>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tous les établissements */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-bold text-gray-900 mb-4">Tous les établissements ({all.length})</h2>
          {all.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Aucun établissement.</p>
          ) : (
            <div className="space-y-3">
              {all.map((r) => {
                const badge = STATUS_BADGE[r.status];
                const ownerEmail = r.owner_id ? ownerEmailById.get(r.owner_id) : null;
                return (
                  <div key={r.id} className="border border-gray-200 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">
                          {r.name}
                          {r.sector && <span className="ml-2 text-xs font-normal text-gray-400">📍 {r.sector}</span>}
                        </p>
                        <p className="text-xs text-gray-400 truncate">
                          <span className="font-mono">{r.id}</span>
                          {" · "}
                          {membersById.get(r.id) ?? 0} membre{(membersById.get(r.id) ?? 0) > 1 ? "s" : ""}
                          {" · "}
                          {ownerEmail ?? (r.owner_id ? "owner sans email" : "aucun owner")}
                        </p>
                      </div>
                      <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded-full ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <Link
                        href={`/admin/${r.id}`}
                        className="text-xs font-semibold text-white bg-brand-dark px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors"
                      >
                        Console admin →
                      </Link>
                      <Link
                        href={`/r/${r.id}`}
                        target="_blank"
                        className="text-xs font-semibold text-gray-700 bg-gray-100 px-3 py-1.5 rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        Page publique ↗
                      </Link>
                      {r.status === "active" ? (
                        <form action={setRestaurantStatus.bind(null, r.id, "disabled")} className="ml-auto">
                          <ConfirmSubmitButton
                            confirmMessage={`Désactiver « ${r.name} » ? Il deviendra invisible pour tous ses membres.`}
                            className="text-xs font-semibold text-red-700 bg-red-50 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors"
                          >
                            Désactiver
                          </ConfirmSubmitButton>
                        </form>
                      ) : r.status === "disabled" ? (
                        <form action={setRestaurantStatus.bind(null, r.id, "active")} className="ml-auto">
                          <button
                            type="submit"
                            className="text-xs font-semibold text-green-700 bg-green-50 px-3 py-1.5 rounded-lg hover:bg-green-100 transition-colors"
                          >
                            Réactiver
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Ajouter un établissement (démarchage terrain) */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-bold text-gray-900 mb-1">Ajouter un établissement</h2>
          <p className="text-xs text-gray-400 mb-4">
            Créé directement actif. Le restaurateur complétera son menu et ses
            tickets depuis sa console admin.
          </p>
          <CreateRestaurantForm />
        </div>

        {/* Rattacher un owner */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-bold text-gray-900 mb-1">Rattacher un restaurateur</h2>
          <p className="text-xs text-gray-400 mb-4">
            Donne (ou réassigne) l&apos;accès admin d&apos;un établissement au compte
            membre correspondant à cet email.
          </p>
          <AssignOwnerForm restaurants={all.map((r) => ({ id: r.id, name: r.name }))} />
        </div>
      </div>
    </div>
  );
}
