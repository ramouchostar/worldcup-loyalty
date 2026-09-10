import Link from "next/link";
import {
  listPendingDuplicateReviews,
  RULE_LABELS,
  type DuplicateReviewOrder,
} from "@/lib/duplicate-reviews";
import { DuplicateDecision } from "./DuplicateDecision";

export const metadata = { title: "Doublons à vérifier" };

// Phase C — la file des cas AMBIGUS. Un doublon certain (même contenu, même
// heure, même membre) est refusé sans passer par ici. N'arrive sur cette page
// que ce qu'aucune règle ne tranche seule : deux membres différents à la même
// minute, une lecture partielle, deux photos qui se ressemblent. Le
// restaurateur voit les deux tickets côte à côte et décide.
//
// La garde d'accès est assurée par le layout admin (middleware + layout).

function euros(n: number): string {
  return `${n.toFixed(2).replace(".", ",")} €`;
}

function TicketCard({
  order,
  role,
}: {
  order: DuplicateReviewOrder | null;
  role: "submitted" | "matched";
}) {
  if (!order) {
    return (
      <div className="flex-1 min-w-0 rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-400">
        {role === "submitted"
          ? "Commande refusée avant enregistrement."
          : "Commande d'origine supprimée."}
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
          {role === "submitted" ? "Ticket soumis" : "Ticket déjà en base"}
        </p>
        <span className="text-[11px] text-gray-400">{order.status}</span>
      </div>
      <p className="font-bold text-gray-900">{order.memberName}</p>
      <p className="text-2xl font-black text-gray-900 tabular-nums mt-1">{euros(order.amount)}</p>
      <p className="text-xs text-gray-500 mt-0.5">
        {order.orderDate}
        {order.orderTime ? ` · ${order.orderTime.slice(0, 5)}` : " · heure non lue"}
      </p>
      <p className="text-xs text-gray-500 font-mono truncate mt-0.5">
        {order.orderNumber ?? "— pas de numéro lu"}
      </p>

      {order.items.length > 0 && (
        <ul className="mt-3 space-y-0.5 text-xs text-gray-600">
          {order.items.map((item, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span className="truncate">
                {item.quantity > 1 ? `${item.quantity}× ` : ""}
                {item.name}
              </span>
              <span className="shrink-0 tabular-nums text-gray-400">
                {item.unitPrice === null ? "—" : euros(item.unitPrice)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {order.receiptUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <a href={order.receiptUrl} target="_blank" rel="noopener noreferrer">
          <img
            src={order.receiptUrl}
            alt={`Ticket de ${order.memberName}`}
            className="mt-3 w-full max-h-72 object-contain rounded-lg border border-gray-100 bg-gray-50"
          />
        </a>
      ) : (
        // ADR 0036 — les images sont effacées au bout de 30 jours ; la ligne,
        // elle, reste. Le dire, plutôt qu'afficher un cadre vide.
        <p className="mt-3 text-xs text-gray-400">Photo indisponible (effacée après 30 jours).</p>
      )}
    </div>
  );
}

export default async function DuplicatesPage({
  params,
}: {
  params: Promise<{ restaurantId: string }>;
}) {
  const { restaurantId } = await params;
  const reviews = await listPendingDuplicateReviews(restaurantId);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Doublons à vérifier</h1>
        <p className="text-gray-500 text-sm mt-1">
          {reviews.length === 0
            ? "Aucun cas en attente."
            : `${reviews.length} cas en attente de décision.`}
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-900">
        Deux tickets se ressemblent trop pour être crédités les yeux fermés, pas assez pour être
        refusés. Compare-les : si c&apos;est le même ticket envoyé deux fois, rejette-le ; si ce sont
        deux clients qui ont commandé la même chose, la commande repart en file de validation
        normale dans{" "}
        <Link href={`/admin/${restaurantId}/orders`} className="font-semibold underline">
          Commandes
        </Link>
        .
      </div>

      {reviews.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
          <p className="text-3xl mb-2">🧾</p>
          <p className="font-semibold text-gray-900">Rien à arbitrer</p>
          <p className="text-sm text-gray-500 mt-1">
            Les doublons certains sont refusés automatiquement — ils n&apos;arrivent jamais ici.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <div key={review.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                <p className="font-bold text-gray-900 text-sm">
                  {RULE_LABELS[review.rule] ?? review.rule}
                </p>
                <p className="text-xs text-gray-400">
                  {new Date(review.createdAt).toLocaleString("fr-BE", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </p>
              </div>
              {review.detail && <p className="text-xs text-gray-500 mb-3">{review.detail}</p>}

              <div className="flex flex-col sm:flex-row gap-3">
                <TicketCard order={review.submitted} role="submitted" />
                <TicketCard order={review.matched} role="matched" />
              </div>

              <div className="mt-4">
                <DuplicateDecision restaurantId={restaurantId} reviewId={review.id} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
