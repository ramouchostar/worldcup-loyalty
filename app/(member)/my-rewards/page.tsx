import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getRestaurantId } from "@/lib/restaurant";
import type { PendingReward } from "@/types";

export default async function MyRewardsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const restaurantId = getRestaurantId();

  const { data } = await supabase
    .from("pending_rewards")
    .select("*")
    .eq("user_id", user.id)
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false });

  const rewards = (data as PendingReward[]) ?? [];
  const pending  = rewards.filter(r => r.status === "pending");
  const redeemed = rewards.filter(r => r.status === "redeemed");

  return (
    <div className="space-y-5 pb-4">
      <div className="flex items-center gap-3">
        <Link href="/dashboard" className="text-gray-400 hover:text-gray-600">←</Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mes récompenses</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Historique de tes cadeaux Belchicken
          </p>
        </div>
      </div>

      {/* En attente */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          🛎 À récupérer ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-6 text-center">
            <p className="text-gray-400 text-sm">Aucune récompense en attente.</p>
            <Link
              href="/submit-order"
              className="inline-block mt-3 bg-brand-red text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors"
            >
              Soumettre une commande →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((r) => (
              <RewardCard key={r.id} reward={r} />
            ))}
          </div>
        )}
      </section>

      {/* Récupérées */}
      {redeemed.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            ✅ Récupérées ({redeemed.length})
          </h2>
          <div className="space-y-3 opacity-60">
            {redeemed.map((r) => (
              <RewardCard key={r.id} reward={r} />
            ))}
          </div>
        </section>
      )}

      {rewards.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
          <p className="text-4xl mb-3">🎁</p>
          <p className="font-bold text-gray-900">Pas encore de récompenses</p>
          <p className="text-gray-500 text-sm mt-1 mb-4">
            Chaque commande directe validée génère un cadeau à récupérer au comptoir.
          </p>
          <Link
            href="/submit-order"
            className="inline-block bg-brand-red text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-red-700 transition-colors"
          >
            Soumettre une commande
          </Link>
        </div>
      )}
    </div>
  );
}

function RewardCard({ reward }: { reward: PendingReward }) {
  const isRedeemed = reward.status === "redeemed";

  return (
    <div className={`bg-white rounded-xl border p-4 ${
      isRedeemed ? "border-gray-100" : "border-brand-gold/40 shadow-sm"
    }`}>
      <div className="space-y-1.5 mb-2">
        {reward.solo_item && (
          <div className="flex items-center gap-2">
            <span>🍗</span>
            <span className="font-bold text-gray-900 text-sm">{reward.solo_item}</span>
            <span className="text-xs text-gray-400 ml-auto">cadeau de base</span>
          </div>
        )}
        {reward.community_item && (
          <div className="flex items-center gap-2">
            <span>👥</span>
            <span className="font-bold text-gray-900 text-sm">+ {reward.community_item}</span>
            <span className="text-xs text-gray-400 ml-auto">bonus communautaire</span>
          </div>
        )}
        {reward.advancement_item && (
          <div className="flex items-center gap-2">
            <span>⚽</span>
            <span className="font-bold text-gray-900 text-sm">+ {reward.advancement_item}</span>
            <span className="text-xs text-gray-400 ml-auto">avancement</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
        <p className="text-xs text-gray-400">
          {new Date(reward.created_at).toLocaleDateString("fr-BE", {
            day: "numeric", month: "short", year: "numeric"
          })}
        </p>
        {isRedeemed ? (
          <span className="text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
            Récupéré ✓
          </span>
        ) : (
          <span className="text-xs font-semibold text-brand-gold bg-brand-gold/10 px-2 py-0.5 rounded-full">
            En attente
          </span>
        )}
      </div>
    </div>
  );
}
