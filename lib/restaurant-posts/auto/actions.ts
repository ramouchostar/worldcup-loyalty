// ADR 0112 — les gestes du restaurateur sur la publication automatique : activer, régler, arrêter, ne pas publier,
// publier maintenant, autre version, et ce qui suit une modification ou une suppression du brouillon. Les droits de la
// personne sont vérifiés AVANT, par les routes (guard.ts) ; le lien de l'e-mail ne permet que le refus (token.ts).

import { checkPublication, type Issue } from "../check";
import { readBlocks } from "../blocks";
import { publishPost, saveDraft, type Failure } from "../service";
import type { PostRow } from "../types";
import { composeChecked, discardOccasion, dishIdsOf, dropDraft } from "./common";
import { isActive } from "./engine";
import { NO_OFFERINGS } from "./offerings";
import { openingReason, openingWindow } from "./opening";
import { VARIANTS } from "./phrases";
import type { AutoDeps } from "./ports";
import { reasonText, STAYS_PENDING, UNVERIFIABLE } from "./reasons";
import { readyKinds } from "./overview";
import {
  AUTO_KINDS, PENDING_STATUSES, TERMS_VERSION, type AutoKind, type AutoSettings, type Occasion,
} from "./types";

type Done<T> = ({ ok: true } & T) | Failure;
const refuse = (status: number, error: string, issues?: Issue[]): Failure => ({ ok: false, status, error, ...(issues ? { issues } : {}) });
const NOT_PENDING = () => refuse(409, "Cet article n'attend plus de publication. Recharge la page.");

const isPending = (o: Occasion | null): o is Occasion => !!o && PENDING_STATUSES.includes(o.status);

// ─── Le réglage ──────────────────────────────────────────────────────────────

/**
 * Activer (avec la phrase d'acceptation) ou changer les types d'une publication déjà allumée. Les types dont la source
 * ne peut rien donner ne se cochent pas.
 */
export async function saveAutoSettings(
  deps: AutoDeps,
  p: { restaurantId: string; userId: string; kinds: unknown; accepted: boolean },
): Promise<Done<{ settings: AutoSettings }>> {
  if (!Array.isArray(p.kinds)) return refuse(400, "Requête invalide.");
  const offered = await readyKinds(deps.sources);
  const kinds = AUTO_KINDS.filter((k) => offered.has(k) && (p.kinds as unknown[]).includes(k));
  if (kinds.length === 0) return refuse(400, "Coche au moins une occasion.");
  const before = await deps.db.settings(p.restaurantId);
  const already = isActive(before);
  if (!already && !p.accepted) return refuse(400, "Coche la case d'acceptation pour activer.");

  const at = deps.now.toISOString();
  const settings: AutoSettings = {
    restaurant_id: p.restaurantId,
    enabled: true,
    kinds,
    // Qui a accepté, quand, quelle phrase : gardé tel quel tant que la publication reste allumée.
    accepted_by: already ? before.accepted_by : p.userId,
    accepted_at: already ? before.accepted_at : at,
    terms_version: already ? before.terms_version : TERMS_VERSION,
    disabled_by: null,
    disabled_at: null,
    updated_at: at,
  };
  await deps.db.saveSettings(settings);
  if (!already) await deps.posts.addEvent({ postId: null, restaurantId: p.restaurantId, kind: "auto_active", reason: kinds.join(","), actorId: p.userId });
  for (const o of await deps.db.pendingOccasions(p.restaurantId)) {
    if (!kinds.includes(o.kind)) await discardOccasion(deps, o, "type_decoche", PENDING_STATUSES);
  }
  return { ok: true, settings };
}

/** Arrêter : agit tout de suite, rien de ce qui attendait ne paraîtra. Les articles déjà en ligne restent. */
export async function stopAuto(deps: AutoDeps, p: { restaurantId: string; userId: string | null }): Promise<Done<object>> {
  const before = await deps.db.settings(p.restaurantId);
  if (!before || !before.enabled) return { ok: true };
  const at = deps.now.toISOString();
  await deps.db.saveSettings({ ...before, enabled: false, disabled_by: p.userId, disabled_at: at, updated_at: at });
  await deps.posts.addEvent({ postId: null, restaurantId: p.restaurantId, kind: "auto_arret", actorId: p.userId });
  for (const o of await deps.db.pendingOccasions(p.restaurantId)) await discardOccasion(deps, o, "arret", PENDING_STATUSES);
  return { ok: true };
}

// ─── Ne pas publier ──────────────────────────────────────────────────────────

export async function refuseOccasion(
  deps: AutoDeps,
  occasion: Occasion,
  p: { via: "lien" | "console"; userId: string | null },
): Promise<Done<object>> {
  if (occasion.status === "refuse") return { ok: true };
  const at = deps.now.toISOString();
  const updated = await deps.db.updateOccasion(
    occasion.id,
    { status: "refuse", reason: "refus", refused_via: p.via, decided_by: p.userId, decided_at: at, updated_at: at },
    PENDING_STATUSES,
  );
  if (!updated) return NOT_PENDING();
  const dropped = await dropDraft(deps, updated);
  await deps.posts.addEvent({ postId: dropped ? null : updated.post_id, restaurantId: updated.restaurant_id, kind: "auto_refus", reason: p.via, actorId: p.userId });
  return { ok: true };
}

/** « Ne pas publier » depuis la console, par l'article. */
export async function refusePost(deps: AutoDeps, p: { restaurantId: string; postId: string; userId: string }): Promise<Done<object>> {
  const o = await deps.db.occasionByPost(p.restaurantId, p.postId);
  return isPending(o) ? refuseOccasion(deps, o, { via: "console", userId: p.userId }) : NOT_PENDING();
}

// ─── Publier maintenant ──────────────────────────────────────────────────────

/**
 * Une personne publie l'article sans attendre. C'est sa décision (les limites par jour et par semaine ne valent que
 * pour la publication automatique), mais l'occasion est revérifiée et le texte repasse par le contrôle.
 */
export async function publishNow(
  deps: AutoDeps,
  occasion: Occasion,
  p: { userId: string; revision: number; rightsConfirmed: boolean },
): Promise<Done<{ post: PostRow }>> {
  const id = occasion.restaurant_id;
  if (!occasion.post_id || !isPending(occasion)) return NOT_PENDING();
  if (deps.now.getTime() >= Date.parse(occasion.expires_at)) {
    await discardOccasion(deps, occasion, "heure_passee", PENDING_STATUSES);
    return refuse(409, "L'occasion est passée : cet article ne peut plus paraître.");
  }
  const restaurant = await deps.restaurant(id);
  if (!restaurant || !restaurant.open) return refuse(404, "Introuvable.");
  const source = deps.sources.find((s) => s.kind === occasion.kind);
  // Une personne appuie : la source peut être interrogée (sa réserve évite les demandes répétées).
  const check = source ? await source.recheck({ restaurantId: id, coords: restaurant.coords, now: deps.now, network: true, publishing: "maintenant" }, occasion.facts) : null;
  if (!check || !check.ok) {
    const reason = check && !check.ok ? check.reason : "source_indisponible";
    // Une panne de la source n'est pas un changement, ni une offre qui ne vaut pas encore : rien ne paraît, l'article attend
    // toujours, la raison est gardée.
    if (STAYS_PENDING.has(reason)) await deps.posts.addEvent({ postId: occasion.post_id, restaurantId: id, kind: "refuse", reason, actorId: p.userId });
    else await discardOccasion(deps, occasion, reason, PENDING_STATUSES);
    return refuse(409, reasonText(reason, null));
  }
  const closed = openingReason(await deps.opening(id, openingWindow(occasion.facts, occasion.publish_day)));
  if (closed) {
    // Fermé : l'article ne paraîtra pas. Horaires inconnus ou illisibles : il attend, le restaurant peut les corriger.
    if (UNVERIFIABLE.has(closed)) await deps.posts.addEvent({ postId: occasion.post_id, restaurantId: id, kind: "refuse", reason: closed, actorId: p.userId });
    else await discardOccasion(deps, occasion, closed, PENDING_STATUSES);
    return refuse(409, reasonText(closed, null));
  }
  const menu = await deps.menu(id);
  const at = deps.now.toISOString();
  const claimed = await deps.db.updateOccasion(
    occasion.id,
    { status: "publie", published_at: at, published_mode: "maintenant", decided_by: p.userId, decided_at: at, updated_at: at },
    PENDING_STATUSES,
  );
  if (!claimed) return NOT_PENDING();
  const giveBack = () =>
    deps.db.updateOccasion(occasion.id, { status: occasion.status, published_at: null, published_mode: null, decided_by: null, decided_at: null }, ["publie"]);
  try {
    const res = await publishPost(deps.posts, {
      restaurantId: id, postId: occasion.post_id, userId: p.userId, revision: p.revision, rightsConfirmed: p.rightsConfirmed,
      dishIds: menu ? dishIdsOf(menu) : null, now: deps.now, expiresAt: occasion.expires_at,
    });
    if (!res.ok) {
      await giveBack();
      return res;
    }
    await deps.posts.addEvent({ postId: res.post.id, restaurantId: id, kind: "auto_publie", reason: "maintenant", actorId: p.userId });
    return res;
  } catch (e) {
    await giveBack();
    throw e;
  }
}

// ─── Autre version ───────────────────────────────────────────────────────────

/** La version suivante des phrases préparées. Elle remplace le texte en cours, modifications comprises. */
export async function nextVersion(
  deps: AutoDeps,
  p: { restaurantId: string; postId: string; revision: number },
): Promise<Done<{ post: PostRow }>> {
  const o = await deps.db.occasionByPost(p.restaurantId, p.postId);
  if (!isPending(o)) return NOT_PENDING();
  const menu = await deps.menu(p.restaurantId);
  if (!menu) return refuse(503, "Ta carte n'a pas pu être lue. Réessaie dans un instant.");
  const offerings = await deps.offerings(p.restaurantId).catch(() => NO_OFFERINGS);
  for (let step = 1; step < VARIANTS; step++) {
    const variant = (o.variant + step) % VARIANTS;
    const { content, issues } = composeChecked(o.facts, { menu, offerings, variant, day: o.publish_day });
    if (issues.length > 0) continue;
    const saved = await saveDraft(deps.posts, { restaurantId: p.restaurantId, postId: p.postId, raw: content, revision: p.revision, now: deps.now });
    if (!saved.ok) return saved;
    await deps.db.updateOccasion(o.id, { variant, title: content.title, modified_at: null, updated_at: deps.now.toISOString() }, PENDING_STATUSES);
    return saved;
  }
  return refuse(409, "Pas d'autre version possible pour cet article.");
}

// ─── Une offre s'arrête ──────────────────────────────────────────────────────

/**
 * Une offre arrêtée ne s'annonce plus (ADR 0110, 0112) : l'article qui attendait est écarté, ceux qui sont en ligne sont
 * retirés tout de suite. La lecture publique les cache de toute façon : ce rangement dit au restaurateur ce qui s'est passé.
 */
export async function stopOfferArticles(deps: AutoDeps, p: { restaurantId: string; offerId: string; userId: string }): Promise<{ withdrawn: number }> {
  for (const o of await deps.db.pendingOccasions(p.restaurantId)) {
    if (o.facts.kind === "promo" && o.facts.offerId === p.offerId) await discardOccasion(deps, o, "promo_finie", PENDING_STATUSES);
  }
  const at = deps.now.toISOString();
  let withdrawn = 0;
  for (const post of await deps.posts.onlineByOffer(p.restaurantId, p.offerId)) {
    const res = await deps.posts.update(post.id, { status: "retire", withdrawn_at: at, updated_at: at }, { status: "en_ligne" });
    if (!res.ok) continue;
    withdrawn++;
    await deps.posts.addEvent({ postId: post.id, restaurantId: p.restaurantId, kind: "retire", reason: "offre_arretee", actorId: p.userId });
  }
  return { withdrawn };
}

// ─── Après une modification ou avant une suppression ─────────────────────────

/** Le restaurateur a gardé une modification : l'échéance ne bouge pas, le texte repassera par le contrôle à 10 h. */
export async function noteModified(deps: AutoDeps, post: PostRow): Promise<void> {
  const o = await deps.db.occasionByPost(post.restaurant_id, post.id);
  if (!isPending(o)) return;
  const at = deps.now.toISOString();
  await deps.db.updateOccasion(o.id, { modified_at: at, title: post.draft_title.slice(0, 80), updated_at: at }, PENDING_STATUSES);
}

/** Avant de supprimer un brouillon qui attendait : c'est un refus. */
export async function noteDeletion(deps: AutoDeps, p: { restaurantId: string; postId: string; userId: string }): Promise<void> {
  const o = await deps.db.occasionByPost(p.restaurantId, p.postId);
  if (!isPending(o)) return;
  const at = deps.now.toISOString();
  const updated = await deps.db.updateOccasion(
    o.id,
    { status: "refuse", reason: "refus", refused_via: "console", decided_by: p.userId, decided_at: at, updated_at: at },
    PENDING_STATUSES,
  );
  if (updated) await deps.posts.addEvent({ postId: null, restaurantId: p.restaurantId, kind: "auto_refus", reason: "console", actorId: p.userId });
}

/** Ce que le contrôle dirait maintenant d'un brouillon en attente (écran « Avant la publication »). */
export function pendingIssues(post: PostRow, dishIds: ReadonlySet<string> | null): Issue[] {
  return checkPublication({ title: post.draft_title, blocks: readBlocks(post.draft_blocks) }, dishIds);
}
