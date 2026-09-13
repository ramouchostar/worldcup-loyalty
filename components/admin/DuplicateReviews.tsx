"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Receipt } from "lucide-react";
import { RULE_LABELS } from "@/lib/duplicate-review-labels";
import type {
  DuplicateReview,
  DuplicateReviewOrder,
  ReviewOutcome,
} from "@/lib/duplicate-reviews";
import { decideDuplicate } from "@/app/admin/[restaurantId]/orders/duplicate-actions";
import { EmptyState } from "@/components/admin/ui";

// ADR 0052 — l'arbitrage des doublons AMBIGUS, désormais un onglet de
// « Commandes » plutôt qu'une page à part. Un doublon certain (même contenu,
// même heure, même membre) est refusé sans passer par ici ; n'arrive dans
// cette file que ce qu'aucune règle ne tranche seule — deux membres
// différents à la même minute, une lecture partielle, deux photos qui se
// ressemblent. Le restaurateur voit les deux tickets côte à côte et décide.
//
// La garde d'accès est assurée par le layout admin et par l'API.

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
      <div className="flex-1 min-w-0 rounded-xl border border-dashed border-paper-border p-4 text-sm text-ink-faint">
        {role === "submitted"
          ? "Commande refusée avant enregistrement."
          : "Commande d'origine supprimée."}
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 rounded-xl border border-paper-border bg-white p-4">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <p className="text-[11px] font-bold uppercase tracking-wider text-ink-faint">
          {role === "submitted" ? "Ticket soumis" : "Ticket déjà en base"}
        </p>
        <span className="text-[11px] text-ink-faint">{order.status}</span>
      </div>
      <p className="font-bold text-ink">{order.memberName}</p>
      <p className="text-2xl font-black text-ink tabular-nums mt-1">{euros(order.amount)}</p>
      <p className="text-xs text-ink-muted mt-0.5">
        {order.orderDate}
        {order.orderTime ? ` · ${order.orderTime.slice(0, 5)}` : " · heure non lue"}
      </p>
      <p className="text-xs text-ink-muted font-mono truncate mt-0.5">
        {order.orderNumber ?? "— pas de numéro lu"}
      </p>

      {order.items.length > 0 && (
        <ul className="mt-3 space-y-0.5 text-xs text-ink-body">
          {order.items.map((item, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span className="truncate">
                {item.quantity > 1 ? `${item.quantity}× ` : ""}
                {item.name}
              </span>
              <span className="shrink-0 tabular-nums text-ink-faint">
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
            className="mt-3 w-full max-h-72 object-contain rounded-lg border border-paper-border bg-paper"
          />
        </a>
      ) : (
        // ADR 0036 — les images sont effacées au bout de 30 jours ; la ligne,
        // elle, reste. Le dire, plutôt qu'afficher un cadre vide.
        <p className="mt-3 text-xs text-ink-faint">Photo indisponible (effacée après 30 jours).</p>
      )}
    </div>
  );
}

// Deux boutons, une décision. Volontairement sans confirmation modale : les
// deux issues sont réversibles depuis les autres onglets (rejeter puis
// re-valider), et une modale de plus sur une file d'attente ralentit le seul
// geste utile.
function DuplicateDecision({
  restaurantId,
  reviewId,
  onDecided,
}: {
  restaurantId: string;
  reviewId: string;
  onDecided: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<ReviewOutcome | null>(null);

  function decide(outcome: ReviewOutcome) {
    setError(null);
    startTransition(async () => {
      const result = await decideDuplicate(restaurantId, reviewId, outcome);
      if (result.ok) {
        setDone(outcome);
        // La commande arbitrée change d'onglet (rejetée, ou repartie en file
        // de validation) : les compteurs de la barre doivent suivre.
        onDecided();
      } else {
        setError(result.error ?? "Erreur.");
      }
    });
  }

  if (done) {
    return (
      <p className="text-sm font-semibold text-ink-body">
        {done === "confirmed_duplicate"
          ? "Doublon confirmé — la commande a été rejetée."
          : "Deux commandes distinctes — la commande repart en file de validation."}
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => decide("confirmed_duplicate")}
          className="bg-danger text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-danger/85 disabled:opacity-60 transition-colors"
        >
          C&apos;est le même ticket
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => decide("legit")}
          className="bg-white border border-paper-border text-ink text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-paper disabled:opacity-60 transition-colors"
        >
          Ce sont deux commandes différentes
        </button>
      </div>
      {error && <p className="text-danger text-xs mt-2">{error}</p>}
    </div>
  );
}

export function DuplicateReviews({
  restaurantId,
  onCountChange,
}: {
  restaurantId: string;
  /** Remonte le nombre de cas en attente au compteur de l'onglet. */
  onCountChange?: (n: number) => void;
}) {
  const [reviews, setReviews] = useState<DuplicateReview[] | null>(null);

  const fetchReviews = useCallback(async () => {
    const res = await fetch(`/api/admin/duplicate-reviews?restaurantId=${restaurantId}`).catch(() => null);
    const data = res?.ok ? await res.json().catch(() => []) : [];
    const list = Array.isArray(data) ? (data as DuplicateReview[]) : [];
    setReviews(list);
    onCountChange?.(list.length);
  }, [restaurantId, onCountChange]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  if (reviews === null) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="bg-white rounded-xl h-40 animate-pulse border border-paper-border" />
        ))}
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <EmptyState icon={Receipt} title="Rien à arbitrer">
        Les doublons certains sont refusés automatiquement — ils n&apos;arrivent jamais ici.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">
        Deux tickets se ressemblent trop pour être crédités les yeux fermés, pas assez pour être
        refusés. Compare-les : si c&apos;est le même ticket envoyé deux fois, rejette-le ; si ce
        sont deux clients qui ont commandé la même chose, la commande repart en file de validation
        normale.
      </p>

      {reviews.map((review) => (
        <div key={review.id} className="rounded-xl border border-paper-border bg-paper p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
            <p className="font-bold text-ink text-sm">{RULE_LABELS[review.rule] ?? review.rule}</p>
            <p className="text-xs text-ink-faint">
              {new Date(review.createdAt).toLocaleString("fr-BE", {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </p>
          </div>
          {review.detail && <p className="text-xs text-ink-muted mb-3">{review.detail}</p>}

          <div className="flex flex-col sm:flex-row gap-3">
            <TicketCard order={review.submitted} role="submitted" />
            <TicketCard order={review.matched} role="matched" />
          </div>

          <div className="mt-4">
            <DuplicateDecision
              restaurantId={restaurantId}
              reviewId={review.id}
              onDecided={fetchReviews}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
