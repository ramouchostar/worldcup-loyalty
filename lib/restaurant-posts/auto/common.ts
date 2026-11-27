// ADR 0112 — les gestes communs à la tâche planifiée et à la console : composer l'article d'une occasion, l'écarter
// avec sa raison, retirer son brouillon.

import { checkPublication, type Issue } from "../check";
import type { PublicMenu } from "../../site-orders/menu";
import type { PostContent } from "../types";
import { pickDish } from "./dish";
import { compose } from "./phrases";
import type { AutoDeps } from "./ports";
import type { AutoReason } from "./reasons";
import type { Facts, Occasion, OccasionStatus, Offerings } from "./types";

export const dishIdsOf = (menu: PublicMenu): Set<string> => new Set(menu.categories.flatMap((c) => c.items).map((i) => i.id));

/** L'article d'une occasion avec le plat du jour, et ce que le contrôle de publication en dit. */
export function composeChecked(
  facts: Facts,
  p: { menu: PublicMenu; offerings: Offerings; variant: number; day: string },
): { content: PostContent; issues: Issue[] } {
  const content = compose(facts, { offerings: p.offerings, dishId: pickDish(p.menu, p.day), variant: p.variant });
  return { content, issues: checkPublication(content, dishIdsOf(p.menu)) };
}

/** La raison nommée d'un refus du contrôle. */
export function issueReason(issues: Issue[]): { reason: AutoReason; detail: string | null } {
  if (issues.some((i) => i.code === "plat_absent")) return { reason: "plat_absent", detail: null };
  if (issues.some((i) => i.code === "carte_illisible")) return { reason: "carte_illisible", detail: null };
  return { reason: "controle", detail: issues[0]?.message.slice(0, 300) ?? null };
}

/**
 * Le brouillon d'une occasion qui ne paraîtra pas : supprimé s'il n'a pas été touché ; modifié par quelqu'un, il reste
 * dans les brouillons (on ne jette pas son texte).
 */
export async function dropDraft(deps: AutoDeps, occasion: Occasion): Promise<boolean> {
  if (!occasion.post_id || occasion.modified_at !== null) return false;
  const post = await deps.posts.get(occasion.restaurant_id, occasion.post_id);
  if (!post || post.status !== "brouillon") return false;
  await deps.posts.remove(post.id);
  return true;
}

/** Écarte une occasion et le trace. `false` : elle avait changé d'état entre-temps, rien n'est fait. */
export async function discardOccasion(
  deps: AutoDeps,
  occasion: Occasion,
  reason: AutoReason,
  expect: readonly OccasionStatus[],
  detail: string | null = null,
): Promise<boolean> {
  const at = deps.now.toISOString();
  const updated = await deps.db.updateOccasion(
    occasion.id,
    { status: "ecarte", reason, reason_detail: detail, published_at: null, published_mode: null, decided_at: at, updated_at: at },
    expect,
  );
  if (!updated) return false;
  const dropped = await dropDraft(deps, updated);
  await deps.posts.addEvent({ postId: dropped ? null : updated.post_id, restaurantId: updated.restaurant_id, kind: "auto_ecarte", reason });
  return true;
}
