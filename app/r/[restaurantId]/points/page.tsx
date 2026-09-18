import { redirect } from "next/navigation";
import Link from "next/link";
import { Coins, Gift, Hourglass, ScrollText } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getPointsSummary, listCatalogue } from "@/lib/points";
import { catalogueView, type CatalogueItem } from "@/lib/catalogue";
import { menuImageUrl } from "@/lib/menu-images";
import { foodIconUrl } from "@/lib/food-icon";
import { formatOpensAt, REDEMPTION_MIN_ORDER_EUR } from "@/lib/reward-window";
import type { PointTransaction } from "@/types";
import { ChooseButton } from "./ChooseButton";

// ADR 0061 — « Mes points » : le solde (disponible, en attente), ce qu'il
// permet déjà ou ce qui manque, le catalogue avec photos et prix en points,
// l'historique. Surface membre : jamais de prix de revient ni d'euros de
// dépense (ADR 0007) — la seule valeur en euros est la condition de retrait.

const REASON_LABELS: Record<PointTransaction["reason"], string> = {
  order_points: "Ticket",
  bank_reward: "Cadeau mis de côté",
  exchange_gift: "Cadeau choisi",
  admin_adjust: "Ajustement",
};

function ItemImage({ item, className }: { item: CatalogueItem; className: string }) {
  const photo = menuImageUrl(item.imagePath);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photo ?? foodIconUrl(item.name)}
      alt=""
      aria-hidden="true"
      className={photo ? `${className} object-cover rounded-lg` : `${className} object-contain p-2`}
    />
  );
}

export default async function PointsPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [summary, catalogue, { count: giftCount }, { data: txData }] = await Promise.all([
    getPointsSummary(user.id, restaurantId),
    listCatalogue(restaurantId),
    supabase
      .from("pending_rewards")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("restaurant_id", restaurantId)
      .eq("status", "available")
      // Seul un cadeau PERSONNEL bloque le choix (ADR 0011) ; un cadeau
      // d'équipe attend à côté (ADR 0061 §7).
      .or("source.is.null,source.neq.team"),
    supabase
      .from("point_transactions")
      .select("id, delta, reason, created_at, available_at")
      .eq("user_id", user.id)
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  // Un cadeau à la fois (ADR 0011) : tant qu'un cadeau attend, on n'en choisit
  // pas d'autre — le serveur le refuserait de toute façon.
  const hasGift = (giftCount ?? 0) > 0;
  const view = catalogueView(summary.available, catalogue);
  const transactions = (txData as (PointTransaction & { available_at?: string | null })[] | null) ?? [];
  const now = new Date();

  return (
    <div className="space-y-5 pb-4">
      <div className="flex items-center gap-3">
        <Link href={`/r/${restaurantId}/dashboard`} className="text-gray-400 hover:text-gray-600">←</Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mes points</h1>
          <p className="text-gray-500 text-sm mt-0.5">Chaque ticket te rapporte des points. Choisis ton cadeau quand tu veux.</p>
        </div>
      </div>

      {/* Solde */}
      <div className="bg-gradient-to-br from-brand-dark to-gray-800 text-white rounded-2xl p-6 text-center">
        <p className="flex items-center justify-center gap-1.5 text-xs uppercase tracking-widest text-brand-gold font-bold mb-1">
          <Coins className="w-4 h-4 shrink-0" aria-hidden="true" />
          Mes points
        </p>
        <p className="text-5xl font-black tabular-nums">{summary.available.toLocaleString("fr-BE")}</p>
        {summary.pending > 0 && (
          // ADR 0061 §2 — les points d'un ticket récent attendent 4 h : jamais
          // pendant la même visite.
          <p className="flex items-center justify-center gap-1.5 text-gray-300 text-xs mt-2">
            <Hourglass className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            +{summary.pending.toLocaleString("fr-BE")} en attente
            {summary.nextAvailableAt ? `, disponibles ${formatOpensAt(new Date(summary.nextAvailableAt), now)}` : ""}
          </p>
        )}
      </div>

      {/* Ce que le solde permet (ADR 0061 §5) */}
      {hasGift ? (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          Un cadeau t&apos;attend déjà.{" "}
          <Link href={`/r/${restaurantId}/my-rewards`} className="font-semibold underline">
            Récupère-le
          </Link>{" "}
          avant d&apos;en choisir un autre.
        </div>
      ) : view.reachable ? (
        <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
          <ItemImage item={view.reachable} className="w-14 h-14 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-green-800">Tu peux déjà avoir</p>
            <p className="font-bold text-gray-900 truncate">{view.reachable.name}</p>
          </div>
          <div className="w-24 shrink-0">
            <ChooseButton itemId={view.reachable.id} itemName={view.reachable.name} price={view.reachable.pricePoints} />
          </div>
        </div>
      ) : view.next ? (
        <div className="rounded-xl border border-gray-100 bg-white p-4">
          <div className="flex items-center gap-3">
            <ItemImage item={view.next} className="w-12 h-12 shrink-0" />
            <p className="text-sm text-gray-700">
              Plus que <span className="font-bold text-gray-900">{view.missing.toLocaleString("fr-BE")} points</span> pour{" "}
              <span className="font-bold text-gray-900">{view.next.name}</span>
            </p>
          </div>
          <div className="mt-3 w-full bg-gray-100 rounded-full h-2">
            <div className="bg-orange-500 h-2 rounded-full" style={{ width: `${Math.max(view.pct, 3)}%` }} />
          </div>
        </div>
      ) : null}

      {/* Catalogue */}
      <section>
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">
          <Gift className="w-4 h-4 shrink-0" aria-hidden="true" />
          Le catalogue
        </h2>
        <p className="text-xs text-gray-500 mb-3">
          Un cadeau choisi se récupère au comptoir, avec une commande d&apos;au moins {REDEMPTION_MIN_ORDER_EUR} €.
        </p>
        {catalogue.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-6 text-center">
            <p className="text-gray-400 text-sm">Le catalogue arrive bientôt — tes points t&apos;attendent.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {catalogue.map((item) => {
              const affordable = item.pricePoints <= summary.available;
              return (
                <div
                  key={item.id}
                  className={`bg-white rounded-xl border p-3 flex flex-col gap-2 ${
                    affordable ? "border-green-200 shadow-sm" : "border-gray-100"
                  }`}
                >
                  <ItemImage item={item} className="w-full aspect-square max-w-full" />
                  <p className="font-semibold text-gray-900 text-sm leading-tight">{item.name}</p>
                  <p className="text-xs font-bold text-gray-700 tabular-nums">{item.pricePoints.toLocaleString("fr-BE")} points</p>
                  <div className="mt-auto">
                    {affordable ? (
                      <ChooseButton itemId={item.id} itemName={item.name} price={item.pricePoints} disabled={hasGift} />
                    ) : (
                      <p className="text-xs text-gray-400">
                        Encore {(item.pricePoints - summary.available).toLocaleString("fr-BE")}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Historique */}
      {transactions.length > 0 && (
        <section>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            <ScrollText className="w-4 h-4 shrink-0" aria-hidden="true" />
            Mouvements
          </h2>
          <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
            {transactions.map((tx) => {
              const pending = !!tx.available_at && new Date(tx.available_at) > now;
              return (
                <div key={tx.id} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <p className="text-sm text-gray-700">
                      {REASON_LABELS[tx.reason] ?? "Mouvement"}
                      {pending && <span className="ml-1.5 text-xs text-gray-400">(en attente)</span>}
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(tx.created_at).toLocaleDateString("fr-BE", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        timeZone: "Europe/Brussels",
                      })}
                    </p>
                  </div>
                  <span className={`text-sm font-bold tabular-nums ${tx.delta >= 0 ? "text-green-700" : "text-gray-500"}`}>
                    {tx.delta >= 0 ? `+${tx.delta.toLocaleString("fr-BE")}` : tx.delta.toLocaleString("fr-BE")}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
