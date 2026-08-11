import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { getPointsBalance } from "@/lib/points";
import type { PointTransaction } from "@/types";
import { ExchangeButton } from "./ExchangeButton";
import { BackLink } from "@/components/member/BackLink";

// ADR 0021 — « Ma réserve » : solde de points personnels, gros cadeaux
// échangeables, historique des mouvements. Surface membre : seuils en
// points et noms d'articles uniquement, jamais de coûts (ADR 0007).

const REASON_LABELS: Record<PointTransaction["reason"], string> = {
  bank_reward: "Cadeau mis de côté",
  exchange_gift: "Échangé contre un cadeau",
  admin_adjust: "Ajustement",
};

export default async function ReservePage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantId: string }>;
  searchParams: Promise<{ banked?: string }>;
}) {
  const { restaurantId } = await params;
  const { banked } = await searchParams;
  // Bandeau de succès après « Mettre de côté » (audit UX 2026-08-11) —
  // nombre sans le mot « points » (ADR 0021).
  const bankedPoints = banked !== undefined ? Number.parseInt(banked, 10) : null;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const [balance, { data: tiersData }, { data: txData }] = await Promise.all([
    getPointsBalance(user.id, restaurantId),
    admin
      .from("reward_tiers")
      .select("id, min_threshold, menu_items(name, is_active, reward_eligible)")
      .eq("restaurant_id", restaurantId)
      .eq("layer", "saver")
      .eq("is_active", true)
      .order("min_threshold", { ascending: true }),
    supabase
      .from("point_transactions")
      .select("id, delta, reason, created_at")
      .eq("user_id", user.id)
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  type Embed = { name: string; is_active: boolean; reward_eligible: boolean };
  const tiers = (tiersData ?? [])
    .map((row) => {
      const mi = Array.isArray(row.menu_items) ? row.menu_items[0] : (row.menu_items as Embed | null);
      if (!mi || !mi.is_active || !mi.reward_eligible) return null;
      return { id: row.id as string, min_threshold: Number(row.min_threshold), item_name: mi.name };
    })
    .filter((t): t is { id: string; min_threshold: number; item_name: string } => t !== null);

  const transactions = (txData as PointTransaction[]) ?? [];

  return (
    <div className="space-y-5 pb-4">
      <div>
        <BackLink href={`/r/${restaurantId}/dashboard`} />
        <h1 className="text-2xl font-bold text-gray-900 mt-1">Ma réserve</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Mets tes cadeaux de côté, échange-les plus tard contre un plus gros
        </p>
      </div>

      {banked !== undefined && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm font-semibold text-green-800">
          {bankedPoints !== null && bankedPoints > 0
            ? `✅ +${bankedPoints} dans ta réserve`
            : "✅ Cadeau mis de côté dans ta réserve"}
        </div>
      )}

      {/* Solde */}
      <div className="bg-gradient-to-br from-brand-dark to-gray-800 text-white rounded-2xl p-6 text-center">
        <p className="text-xs uppercase tracking-widest text-brand-gold font-bold mb-1">💰 Ma réserve</p>
        <p className="text-5xl font-black tabular-nums">{balance}</p>
        {/* Première cible visible dès le solde 0 (progression dotée, audit UX) —
            nom + seuil uniquement, jamais de coût (ADR 0021 / ADR 0007). */}
        {balance === 0 && tiers.length > 0 && (
          <p className="text-sm text-brand-gold font-semibold mt-2">
            Premier gros cadeau : {tiers[0].item_name} à {tiers[0].min_threshold}
          </p>
        )}
        <p className="text-gray-300 text-xs mt-2">
          Chaque cadeau mis de côté depuis{" "}
          <Link href={`/r/${restaurantId}/my-rewards`} className="underline">
            Mes récompenses
          </Link>{" "}
          fait grandir ta réserve.
        </p>
      </div>

      {/* Gros cadeaux */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          🎁 À échanger
        </h2>
        {tiers.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-6 text-center">
            <p className="text-gray-400 text-sm">
              Les gros cadeaux arrivent bientôt — continue de mettre de côté.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {tiers.map((tier) => {
              const reachable = balance >= tier.min_threshold;
              const missing = tier.min_threshold - balance;
              return (
                <div
                  key={tier.id}
                  className={`bg-white rounded-xl border p-4 flex items-center justify-between gap-3 ${
                    reachable ? "border-brand-gold/40 shadow-sm" : "border-gray-100"
                  }`}
                >
                  <div>
                    <p className="font-bold text-gray-900 text-sm">{tier.item_name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {tier.min_threshold} de réserve
                      {!reachable && ` — encore ${missing}`}
                    </p>
                  </div>
                  <ExchangeButton tierId={tier.id} disabled={!reachable} />
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Historique */}
      {transactions.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            📜 Mouvements
          </h2>
          <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
            {transactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <p className="text-sm text-gray-700">{REASON_LABELS[tx.reason]}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(tx.created_at).toLocaleDateString("fr-BE", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <span
                  className={`text-sm font-bold tabular-nums ${
                    tx.delta >= 0 ? "text-green-700" : "text-gray-500"
                  }`}
                >
                  {tx.delta >= 0 ? `+${tx.delta}` : tx.delta}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
