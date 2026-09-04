import { createAdminClient } from "./supabase";

// ============================================================
// File « doublons à vérifier » — lecture et décision (phase C).
//
// Un rapprochement certain est refusé sans humain. Ce qui reste incertain —
// même contenu à la même minute mais deux membres différents, empreinte
// partielle, photos qui se ressemblent — arrive ici, où le restaurateur voit
// les DEUX tickets côte à côte et tranche.
//
// Tolérant à l'absence de la table (migration 20260904-1830 appliquée à la
// main) : la file est alors simplement vide.
// ============================================================

export type DuplicateReviewOrder = {
  id: string;
  user_id: string;
  memberName: string;
  amount: number;
  orderDate: string;
  orderTime: string | null;
  orderNumber: string | null;
  status: string;
  submittedAt: string;
  /** URL signée du ticket (bucket privé, ADR 0003) — null si l'image est purgée. */
  receiptUrl: string | null;
  items: { name: string; quantity: number; unitPrice: number | null }[];
};

export type DuplicateReview = {
  id: string;
  rule: string;
  detail: string | null;
  createdAt: string;
  /** La commande soumise (celle qui attend une décision). */
  submitted: DuplicateReviewOrder | null;
  /** Celle à laquelle elle a été rapprochée. */
  matched: DuplicateReviewOrder | null;
};

/** Phrase lisible par règle — jamais montrée au membre, seulement en console. */
export const RULE_LABELS: Record<string, string> = {
  same_order_number: "Numéro de ticket identique",
  fingerprint_time: "Même contenu, même heure",
  fingerprint_same_day: "Même contenu, même jour",
  fingerprint_number_confusion: "Même contenu, numéro mal lu",
  same_user_time_amount: "Même membre, même heure et même montant",
  image_phash: "Photos quasi identiques",
  image_phash_far: "Photos ressemblantes",
  cross_user_fingerprint: "Contenu identique, deux membres différents",
  near_fingerprint: "Contenu presque identique",
};

function toStoragePath(value: string): string {
  // `receipt_url` stocke un chemin ; les lignes historiques peuvent porter une
  // URL complète (avant l'ADR 0003 tel qu'appliqué).
  const marker = "/receipts/";
  const i = value.indexOf(marker);
  return i === -1 ? value : value.slice(i + marker.length);
}

type OrderRow = {
  id: string;
  user_id: string;
  amount: number | string;
  order_date: string;
  order_time: string | null;
  order_number: string | null;
  status: string;
  submitted_at: string;
  receipt_url: string | null;
};

/**
 * Les cas en attente pour un établissement. Best-effort : toute erreur (table
 * absente, panne) renvoie une file vide plutôt qu'une console en erreur.
 */
export async function listPendingDuplicateReviews(
  restaurantId: string,
  limit = 50
): Promise<DuplicateReview[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("duplicate_reviews")
      .select("id, rule, detail, created_at, order_id, matched_order_id")
      .eq("restaurant_id", restaurantId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;

    const reviews = (data ?? []) as {
      id: string;
      rule: string;
      detail: string | null;
      created_at: string;
      order_id: string | null;
      matched_order_id: string | null;
    }[];
    if (reviews.length === 0) return [];

    const orderIds = [
      ...new Set(
        reviews.flatMap((r) => [r.order_id, r.matched_order_id]).filter((v): v is string => !!v)
      ),
    ];

    const [{ data: orders }, { data: items }] = await Promise.all([
      admin
        .from("orders")
        .select("id, user_id, amount, order_date, order_time, order_number, status, submitted_at, receipt_url")
        .in("id", orderIds),
      admin
        .from("order_items")
        .select("order_id, raw_name, quantity, unit_price, line_index")
        .in("order_id", orderIds)
        .order("line_index", { ascending: true }),
    ]);

    const orderRows = (orders ?? []) as OrderRow[];

    const [{ data: profiles }, signed] = await Promise.all([
      admin
        .from("profiles")
        .select("id, display_name")
        .in("id", [...new Set(orderRows.map((o) => o.user_id))]),
      (async () => {
        const paths = orderRows
          .map((o) => (o.receipt_url ? toStoragePath(o.receipt_url) : null))
          .filter((p): p is string => !!p);
        if (paths.length === 0) return new Map<string, string>();
        const { data } = await admin.storage.from("receipts").createSignedUrls(paths, 3600);
        return new Map(
          (data ?? [])
            .filter((s) => s.signedUrl && s.path)
            .map((s) => [s.path as string, s.signedUrl as string])
        );
      })(),
    ]);

    const nameById = new Map(
      ((profiles ?? []) as { id: string; display_name: string | null }[]).map((p) => [
        p.id,
        (p.display_name ?? "").trim() || "Membre",
      ])
    );

    const itemsByOrder = new Map<string, DuplicateReviewOrder["items"]>();
    for (const row of (items ?? []) as {
      order_id: string;
      raw_name: string;
      quantity: number | string;
      unit_price: number | string | null;
    }[]) {
      const list = itemsByOrder.get(row.order_id) ?? [];
      list.push({
        name: row.raw_name,
        quantity: Number(row.quantity),
        unitPrice: row.unit_price === null ? null : Number(row.unit_price),
      });
      itemsByOrder.set(row.order_id, list);
    }

    const orderById = new Map<string, DuplicateReviewOrder>();
    for (const o of orderRows) {
      const path = o.receipt_url ? toStoragePath(o.receipt_url) : null;
      orderById.set(o.id, {
        id: o.id,
        user_id: o.user_id,
        memberName: nameById.get(o.user_id) ?? "Membre",
        amount: Number(o.amount),
        orderDate: o.order_date,
        orderTime: o.order_time,
        orderNumber: o.order_number,
        status: o.status,
        submittedAt: o.submitted_at,
        receiptUrl: path ? signed.get(path) ?? null : null,
        items: itemsByOrder.get(o.id) ?? [],
      });
    }

    return reviews.map((r) => ({
      id: r.id,
      rule: r.rule,
      detail: r.detail,
      createdAt: r.created_at,
      submitted: r.order_id ? orderById.get(r.order_id) ?? null : null,
      matched: r.matched_order_id ? orderById.get(r.matched_order_id) ?? null : null,
    }));
  } catch (e) {
    console.error("[duplicate-reviews] listPendingDuplicateReviews failed:", (e as Error).message);
    return [];
  }
}

export type ReviewOutcome = "confirmed_duplicate" | "legit";

/**
 * Tranche un cas.
 *
 * - `confirmed_duplicate` : la commande soumise est rejetée. Elle n'avait
 *   jamais été validée (le flag `duplicate_review` la retenait en file), donc
 *   AUCUN point n'est repris et aucun score d'équipe n'est touché — c'est la
 *   raison pour laquelle un cas ambigu attend ici plutôt que d'être crédité.
 * - `legit` : le flag est retiré. La commande redevient une commande en attente
 *   ordinaire, que le restaurateur valide depuis « Commandes » comme les autres
 *   — cette page ne valide jamais elle-même, pour ne pas court-circuiter les
 *   autres contrôles (montant, en-tête, OCR).
 */
export async function decideDuplicateReview(params: {
  reviewId: string;
  restaurantId: string;
  deciderId: string;
  outcome: ReviewOutcome;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("duplicate_reviews")
      .select("id, order_id, restaurant_id, status")
      .eq("id", params.reviewId)
      .eq("restaurant_id", params.restaurantId)
      .maybeSingle();
    if (error) throw error;
    const review = data as { id: string; order_id: string | null; status: string } | null;
    if (!review) return { ok: false, error: "Cas introuvable." };
    // Idempotent : un double-tap ne rejoue rien.
    if (review.status !== "pending") return { ok: true };

    if (review.order_id) {
      if (params.outcome === "confirmed_duplicate") {
        const { error: e } = await admin
          .from("orders")
          .update({
            status: "rejected",
            rejection_reason: "Doublon confirmé — ce ticket avait déjà été enregistré.",
          })
          .eq("id", review.order_id)
          .eq("status", "pending");
        if (e) throw e;
      } else {
        const { data: order, error: e } = await admin
          .from("orders")
          .select("flag_reasons")
          .eq("id", review.order_id)
          .maybeSingle();
        if (e) throw e;
        const flags = ((order as { flag_reasons: string[] | null } | null)?.flag_reasons ?? []).filter(
          (f) => f !== "duplicate_review"
        );
        const { error: e2 } = await admin
          .from("orders")
          .update({ flag_reasons: flags })
          .eq("id", review.order_id);
        if (e2) throw e2;
      }
    }

    const { error: e3 } = await admin
      .from("duplicate_reviews")
      .update({
        status: params.outcome,
        decided_at: new Date().toISOString(),
        decided_by: params.deciderId,
      })
      .eq("id", params.reviewId);
    if (e3) throw e3;

    return { ok: true };
  } catch (e) {
    console.error("[duplicate-reviews] decideDuplicateReview failed:", (e as Error).message);
    return { ok: false, error: "Erreur serveur. Réessaie." };
  }
}

/** Compteur pour la pastille de navigation. 0 si la table n'existe pas encore. */
export async function countPendingDuplicateReviews(restaurantId: string): Promise<number> {
  try {
    const admin = createAdminClient();
    const { count, error } = await admin
      .from("duplicate_reviews")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId)
      .eq("status", "pending");
    if (error) throw error;
    return count ?? 0;
  } catch {
    return 0;
  }
}
