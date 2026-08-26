import { redirect, notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getRestaurant } from "@/lib/restaurant";
import { getAdminAccess, canManageEstablishment } from "@/lib/admin-guard";
import { listRestaurantAdmins, getSeatCounts } from "@/lib/restaurant-admins";
import { getActiveInvitesByRestaurant } from "@/lib/owner-invites";
import { SeatInviteForm } from "./SeatInviteForm";
import { SeatRow } from "./SeatRow";

// ADR 0041 §7/§10 — « Accès console » : qui a un siège sur cet établissement,
// invitation d'un nouveau siège et retrait d'un siège existant, pour qui le
// peut (gérant, manager, super-admin — canManageEstablishment). Visible par
// tout siège (la liste elle-même n'est pas restreinte) ; le formulaire
// d'invitation et le bouton « Retirer » ne s'affichent que pour ceux qui ont
// le droit — un siège équipe voit la liste, sans pouvoir agir dessus.
export default async function AdminAccessPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const restaurant = await getRestaurant(restaurantId);
  if (!restaurant) notFound();

  const [access, seats, counts, activeInvites] = await Promise.all([
    getAdminAccess(user.id, restaurantId),
    listRestaurantAdmins(restaurantId),
    getSeatCounts(restaurantId),
    getActiveInvitesByRestaurant(),
  ]);
  const canManage = canManageEstablishment(access);
  const invite = activeInvites.get(restaurantId) ?? null;

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Accès console</h1>
        <p className="text-gray-500 text-sm mt-1">
          Qui a la main sur la console de {restaurant.name} — gérant, manager, équipe.
          Maximum 2 gérants et 2 managers ; équipe est illimité.
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Gérant {counts.gerant}/2 · Manager {counts.manager}/2 · Équipe {counts.equipe}
        </p>
        {seats.length === 0 ? (
          <p className="text-sm text-gray-400">Aucun siège attribué pour l&apos;instant.</p>
        ) : (
          <ul className="space-y-2">
            {seats.map((seat) => (
              <SeatRow
                key={seat.userId}
                restaurantId={restaurantId}
                userId={seat.userId}
                label={seat.displayName ?? seat.email ?? seat.userId}
                role={seat.role}
                canRemove={canManage}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <h2 className="font-bold text-gray-900 mb-1">Inviter</h2>
        {canManage ? (
          <>
            <p className="text-xs text-gray-400 mb-4">
              Génère un lien à envoyer. Le rôle proposé est confirmé par la personne invitée en
              l&apos;activant — inviter n&apos;évince jamais un siège existant.
            </p>
            <SeatInviteForm
              restaurantId={restaurantId}
              initialInvite={invite ? { url: invite.url, role: invite.role } : null}
            />
          </>
        ) : (
          <p className="text-sm text-gray-500">Seuls les gérants et managers peuvent inviter.</p>
        )}
      </div>
    </div>
  );
}
