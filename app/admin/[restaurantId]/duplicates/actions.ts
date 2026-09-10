"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import { decideDuplicateReview, type ReviewOutcome } from "@/lib/duplicate-reviews";

// Phase C — décision humaine sur un cas ambigu. La garde reprend celle des
// autres surfaces de la console (gérant, manager, siège équipe, super-admin) :
// arbitrer un doublon fait partie du quotidien du comptoir, pas des trois pages
// financières réservées (ADR 0041 §6).
export async function decideDuplicate(
  restaurantId: string,
  reviewId: string,
  outcome: ReviewOutcome
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return { ok: false, error: "Accès refusé." };

  const result = await decideDuplicateReview({
    reviewId,
    restaurantId,
    deciderId: guard.userId,
    outcome,
  });
  if (result.ok) {
    revalidatePath(`/admin/${restaurantId}/duplicates`);
    revalidatePath(`/admin/${restaurantId}/orders`);
  }
  return result;
}
