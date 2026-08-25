import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import {
  approveRestaurant,
  rejectRestaurant,
  grantPlanRequest,
  dismissPlanRequest,
} from "./actions";
import { getPendingPlanRequests } from "@/lib/plan-requests";
import type { Plan } from "@/lib/entitlements";
import { getActiveInvitesByRestaurant } from "@/lib/owner-invites";
import { selectRestaurantsWithDemo } from "@/lib/demo";
import { fetchAllRows } from "@/lib/paged-select";
import { CreateRestaurantForm } from "./CreateRestaurantForm";
import { AssignOwnerForm } from "./AssignOwnerForm";
import { InviteOwnerForm } from "./InviteOwnerForm";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { RestaurantList, type RestaurantViewRow } from "./RestaurantList";

type RestaurantRow = {
  id: string;
  name: string;
  sector: string | null;
  status: "pending" | "active" | "disabled";
  owner_id: string | null;
  created_at: string;
  is_demo?: boolean | null;
};

const COLUMNS = "id, name, sector, status, owner_id, created_at, is_demo";
const LEGACY_COLUMNS = "id, name, sector, status, owner_id, created_at";

export default async function PlatformPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  if (!profile?.is_super_admin) redirect("/join?reason=platform-required");

  const admin = createAdminClient();

  const [{ rows: allRaw, demoColumnMissing }, { data: subsRaw }, planRequests] = await Promise.all([
    selectRestaurantsWithDemo<RestaurantRow>(admin, COLUMNS, LEGACY_COLUMNS),
    // ADR 0029 — plans courants (m48) + demandes de plan (m51)
    admin.from("restaurant_subscriptions").select("restaurant_id, plan, status"),
    getPendingPlanRequests(),
  ]);
  const planById = new Map(
    (((subsRaw as { restaurant_id: string; plan: Plan; status: string }[] | null) ?? []))
      .filter((s) => s.status === "active")
      .map((s) => [s.restaurant_id, s.plan])
  );

  const all = allRaw;
  const pendingList = all.filter((r) => r.status === "pending");
  // ADR 0033 §1 — les compteurs de tête comptent le RÉSEAU RÉEL. Un
  // établissement fictif gonflerait le seul chiffre qu'on regarde pour savoir
  // où on en est ; il est compté à part, jamais avec.
  const liveList = all.filter((r) => !r.is_demo);
  const activeCount = liveList.filter((r) => r.status === "active").length;
  const demoCount = all.length - liveList.length;

  // Emails des owners + compteurs par établissement (réseau petit — les
  // requêtes parallèles suffisent largement)
  const ownerIds = Array.from(new Set(all.map((r) => r.owner_id).filter((id): id is string => !!id)));
  const [{ data: owners }, membershipsRes, menuCounts, activeInvites] = await Promise.all([
    ownerIds.length > 0
      ? admin.from("profiles").select("id, email").in("id", ownerIds)
      : Promise.resolve({ data: [] }),
    // Paginé : PostgREST tronque en silence au-delà de `max_rows`, et un
    // compteur d'adhésions tronqué ne se voit pas (lib/paged-select.ts).
    fetchAllRows<{ restaurant_id: string }>((from, to) =>
      admin.from("memberships").select("restaurant_id").range(from, to)
    ),
    Promise.all(
      pendingList.map((r) =>
        admin.from("menu_items").select("id", { count: "exact", head: true }).eq("restaurant_id", r.id)
      )
    ),
    // ADR 0032 — liens d'invitation restaurateur encore en circulation
    getActiveInvitesByRestaurant(),
  ]);
  const ownerEmailById = new Map(
    ((owners ?? []) as { id: string; email: string | null }[]).map((o) => [o.id, o.email])
  );
  const membersById = new Map<string, number>();
  for (const m of membershipsRes.rows) {
    membersById.set(m.restaurant_id, (membersById.get(m.restaurant_id) ?? 0) + 1);
  }
  const liveMemberCount = liveList.reduce((sum, r) => sum + (membersById.get(r.id) ?? 0), 0);

  const restaurantViews: RestaurantViewRow[] = all.map((r) => {
    const invite = activeInvites.get(r.id);
    return {
      id: r.id,
      name: r.name,
      sector: r.sector,
      status: r.status,
      isDemo: !!r.is_demo,
      memberCount: membersById.get(r.id) ?? 0,
      ownerEmail: r.owner_id ? ownerEmailById.get(r.owner_id) ?? null : null,
      hasOwner: !!r.owner_id,
      plan: planById.get(r.id) ?? "gratuit",
      invite: invite ? { id: invite.id, url: invite.url, expiresAt: invite.expiresAt } : null,
    };
  });

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-8 px-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Réseau</h1>
        <p className="text-gray-500 text-sm mt-1">
          Validation des établissements, accès restaurateur et plans.{" "}
          <Link href="/platform/stats" className="text-brand-red font-semibold hover:underline">
            Voir les chiffres →
          </Link>
        </p>
      </div>

      {demoColumnMissing && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-900">
          <p className="font-semibold">Migration m56 non appliquée</p>
          <p className="text-amber-700 text-xs mt-0.5">
            Les comptes démo ne sont pas encore distingués des vrais établissements.
            Exécute <span className="font-mono">docs/m56-demo-restaurants-and-backlog.sql</span> dans
            Supabase pour activer le marquage démo, la date d&apos;activation et le backlog.
          </p>
        </div>
      )}

      {/* Stats cross-établissements — argument commercial ADR 0015 §9 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
          <p className="text-3xl font-bold text-gray-900 tabular-nums">{activeCount}</p>
          <p className="text-xs text-gray-500 mt-1">établissements actifs</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
          <p className="text-3xl font-bold text-brand-red tabular-nums">{liveMemberCount}</p>
          <p className="text-xs text-gray-500 mt-1">adhésions réseau</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
          <p className="text-3xl font-bold text-gray-400 tabular-nums">{demoCount}</p>
          <p className="text-xs text-gray-500 mt-1">comptes démo</p>
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
                      {r.is_demo && (
                        <span className="ml-2 text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                          Démo
                        </span>
                      )}
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

      {/* Demandes de plan (ADR 0029 — CTA du paywall doux, m51) */}
      {planRequests.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-bold text-gray-900 mb-4">
            Demandes de plan
            <span className="ml-2 bg-brand-gold text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {planRequests.length}
            </span>
          </h2>
          <div className="space-y-3">
            {planRequests.map((req) => {
              const resto = all.find((r) => r.id === req.restaurant_id);
              return (
                <div key={req.id} className="border border-gray-200 rounded-xl p-4">
                  <p className="font-semibold text-gray-900">
                    {resto?.name ?? req.restaurant_id}
                    <span className="ml-2 text-xs font-bold text-brand-red uppercase">
                      → {req.requested_plan}
                    </span>
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(req.created_at).toLocaleDateString("fr-BE", { day: "numeric", month: "short", year: "numeric" })}
                    {req.feature && <> · depuis « {req.feature} »</>}
                    {" · plan actuel : "}
                    {planById.get(req.restaurant_id) ?? "gratuit"}
                  </p>
                  <div className="flex gap-2 mt-3">
                    <form action={grantPlanRequest.bind(null, req.restaurant_id, req.requested_plan)}>
                      <button
                        type="submit"
                        className="bg-green-600 text-white text-sm font-semibold px-4 py-1.5 rounded-lg hover:bg-green-700 transition-colors"
                      >
                        Activer {req.requested_plan}
                      </button>
                    </form>
                    <form action={dismissPlanRequest.bind(null, req.id)}>
                      <button
                        type="submit"
                        className="bg-gray-100 text-gray-700 text-sm font-semibold px-4 py-1.5 rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        Ignorer
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tous les établissements */}
      <RestaurantList restaurants={restaurantViews} />

      {/* Ajouter un établissement (démarchage terrain) */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="font-bold text-gray-900 mb-1">Ajouter un établissement</h2>
        <p className="text-xs text-gray-400 mb-4">
          Créé directement actif. Le restaurateur complétera son menu et ses
          tickets depuis sa console admin.
        </p>
        <CreateRestaurantForm />
      </div>

      {/* Inviter le restaurateur par lien (ADR 0032) — voie principale */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="font-bold text-gray-900 mb-1">Inviter le restaurateur</h2>
        <p className="text-xs text-gray-400 mb-4">
          Génère un lien à envoyer au restaurateur. Il devient admin de
          l&apos;établissement en cliquant — il peut créer son compte à ce
          moment-là, rien n&apos;est requis avant.
        </p>
        <InviteOwnerForm
          restaurants={restaurantViews.map((r) => ({
            id: r.id,
            name: r.name,
            hasOwner: r.hasOwner,
            ownerEmail: r.ownerEmail,
          }))}
        />
      </div>

      {/* Rattacher un owner — voie directe, compte déjà existant */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="font-bold text-gray-900 mb-1">
          Rattacher un compte existant
          <span className="ml-2 text-xs font-normal text-gray-400">avancé</span>
        </h2>
        <p className="text-xs text-gray-400 mb-4">
          Donne (ou réassigne) l&apos;accès admin immédiatement, sans passer par
          un lien — l&apos;email doit déjà correspondre à un compte membre.
        </p>
        <AssignOwnerForm restaurants={all.map((r) => ({ id: r.id, name: r.name }))} />
      </div>
    </div>
  );
}
