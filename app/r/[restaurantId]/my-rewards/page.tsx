import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import type { PendingReward } from "@/types";
import { RedeemButton } from "./RedeemButton";
import { BankButton } from "./BankButton";

// Montant de la commande d'origine (jointure RLS own-read) — sert à
// afficher les points de réserve avant le choix « Mettre de côté »
// Vue restreinte de PendingReward : les colonnes de coût (€) ne sont
// volontairement pas sélectionnées (ADR 0007).
type RewardWithOrder = Omit<PendingReward, "user_id" | "restaurant_id" | "solo_cost" | "community_cost" | "advancement_cost"> & {
  orders: { amount: number } | null;
};

export default async function MyRewardsPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Colonnes explicites (audit 2026-07-23) : jamais les *_cost — un
  // select("*") remonterait les coûts € des cadeaux dans le rendu (ADR 0007).
  const { data } = await supabase
    .from("pending_rewards")
    .select("id, status, source, order_id, solo_item, community_item, advancement_item, created_at, redeemed_at, banked_at, orders(amount)")
    .eq("user_id", user.id)
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false });

  const rewards = (data as unknown as RewardWithOrder[]) ?? [];
  const available = rewards.filter((r) => r.status === "available");
  const redeemed  = rewards.filter((r) => r.status === "redeemed");
  const expired   = rewards.filter((r) => r.status === "expired");
  const banked    = rewards.filter((r) => r.status === "banked");

  return (
    <div className="space-y-5 pb-4">
      <div className="flex items-center gap-3">
        <Link href={`/r/${restaurantId}/dashboard`} className="text-gray-400 hover:text-gray-600">←</Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mes récompenses</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Historique de tes cadeaux
          </p>
        </div>
      </div>

      {/* À récupérer */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          🛎 À récupérer ({available.length})
        </h2>
        {available.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-6 text-center">
            <p className="text-gray-400 text-sm">Aucune récompense en attente.</p>
            <Link
              href={`/r/${restaurantId}/submit-order`}
              className="inline-block mt-3 bg-brand-red text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-brand-red/85 transition-colors"
            >
              Soumettre une commande →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {available.map((r) => (
              <RewardCard key={r.id} reward={r} />
            ))}
          </div>
        )}
      </section>

      {/* Mises de côté (ADR 0021) */}
      {banked.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            💰 Mises de côté ({banked.length})
          </h2>
          <div className="space-y-3 opacity-70">
            {banked.map((r) => (
              <RewardCard key={r.id} reward={r} />
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Ces cadeaux ont rejoint{" "}
            <Link href={`/r/${restaurantId}/reserve`} className="underline">
              ta réserve
            </Link>
            .
          </p>
        </section>
      )}

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

      {/* Expirées */}
      {expired.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            ⏱ Expirées ({expired.length})
          </h2>
          <div className="space-y-3 opacity-40">
            {expired.map((r) => (
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
            href={`/r/${restaurantId}/submit-order`}
            className="inline-block bg-brand-red text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-brand-red/85 transition-colors"
          >
            Soumettre une commande
          </Link>
        </div>
      )}
    </div>
  );
}

function RewardCard({ reward }: { reward: RewardWithOrder }) {
  const isAvailable = reward.status === "available";
  const isRedeemed  = reward.status === "redeemed";
  const isBanked    = reward.status === "banked";
  // Seuls les cadeaux issus d'une commande se mettent de côté (ADR 0021) —
  // un cadeau échangé depuis la réserve (order_id NULL) ne se re-banke pas.
  const canBank     = isAvailable && reward.order_id !== null;
  const bankPoints  = reward.orders ? Math.floor(Number(reward.orders.amount)) : null;

  const expiresAt = new Date(new Date(reward.created_at).getTime() + 48 * 60 * 60 * 1000);
  const hoursLeft = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60)));
  const isUrgent  = isAvailable && hoursLeft <= 6;

  return (
    <div
      className={`bg-white rounded-xl border p-4 ${
        isAvailable ? "border-brand-gold/40 shadow-sm" : "border-gray-100"
      }`}
    >
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
            <span>🏆</span>
            <span className="font-bold text-gray-900 text-sm">+ {reward.advancement_item}</span>
            <span className="text-xs text-gray-400 ml-auto">bonus d&apos;équipe</span>
          </div>
        )}
      </div>

      {isAvailable && (
        <div className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium mb-2 ${
          isUrgent ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
        }`}>
          <span>⏰</span>
          {hoursLeft <= 0
            ? "Expire très bientôt !"
            : isUrgent
            ? `Plus que ${hoursLeft}h pour récupérer !`
            : `Expire le ${expiresAt.toLocaleDateString("fr-BE", { day: "numeric", month: "short" })} à ${expiresAt.toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" })}`
          }
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100">
        <p className="text-xs text-gray-400">
          {new Date(reward.created_at).toLocaleDateString("fr-BE", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </p>
        {isAvailable ? (
          <span className="flex items-center gap-2">
            {canBank && <BankButton points={bankPoints} />}
            <RedeemButton />
          </span>
        ) : isRedeemed ? (
          <span className="text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
            Récupéré ✓
          </span>
        ) : isBanked ? (
          <span className="text-xs font-semibold text-brand-dark bg-gray-100 px-2 py-0.5 rounded-full">
            💰 Mis de côté{bankPoints !== null ? ` (+${bankPoints})` : ""}
          </span>
        ) : (
          <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
            Expiré
          </span>
        )}
      </div>
    </div>
  );
}
