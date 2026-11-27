// ADR 0112 — la tâche planifiée : à 17 h à Bruxelles, préparer les prochains jours et prévenir pour demain ; à 10 h,
// revérifier puis publier. Rejouable : chaque pas change d'abord l'état de l'occasion (une seule exécution y arrive),
// et une occasion déjà passée à l'étape suivante n'est plus touchée. Aucun échec silencieux : chaque occasion écartée
// garde sa raison, chaque panne remonte dans le compte rendu.

import { readBlocks, photoPaths } from "../blocks";
import { checkPublication } from "../check";
import { draftSlug } from "../slug";
import { publishPost } from "../service";
import { composeChecked, discardOccasion, dishIdsOf, issueReason } from "./common";
import { compose, initialVariant, occasionLabel, sourceCredit } from "./phrases";
import { openingReason, openingWindow } from "./opening";
import { planOccasions, type PlanStep } from "./plan";
import type { AutoDeps, AutoRestaurant, NewOccasion } from "./ports";
import { deliveryProof } from "./proof";
import type { AutoReason } from "./reasons";
import type { OccasionSource } from "./sources/types";
import { addDays, brusselsDay, brusselsHourOf, publishAt, weekStart } from "./time";
import {
  HORIZON_DAYS, MAX_PER_DAY, MAX_PER_WEEK, NOTIFY_HOUR, PUBLISH_HOUR, TERMS_VERSION,
  type AutoKind, type AutoSettings, type Candidate, type Occasion, type Offerings,
} from "./types";
import { NO_OFFERINGS, stillOffered } from "./offerings";

export type RunReport = {
  hour: number;
  /** `false` : ce n'était ni 17 h ni 10 h à Bruxelles, rien n'a été lu. */
  acted: boolean;
  restaurants: number;
  planned: number;
  discarded: number;
  notified: number;
  published: number;
  expired: number;
  /** Les sources qui ne peuvent rien donner, et pourquoi. */
  unavailable: { kind: AutoKind; why: string }[];
  errors: string[];
};

const emptyReport = (hour: number, acted: boolean): RunReport => ({
  hour, acted, restaurants: 0, planned: 0, discarded: 0, notified: 0, published: 0, expired: 0, unavailable: [], errors: [],
});

/** Une activation compte si elle est allumée avec la phrase d'acceptation d'aujourd'hui. */
export const isActive = (s: AutoSettings | null): s is AutoSettings => !!s && s.enabled && s.terms_version === TERMS_VERSION && s.accepted_at !== null;

const sourceFor = (deps: AutoDeps, kind: AutoKind): OccasionSource | undefined => deps.sources.find((s) => s.kind === kind);
// La tâche passe à l'heure pile : elle ne lit que les réserves (la météo est demandée par une tâche décalée).
const context = (deps: AutoDeps, r: AutoRestaurant) => ({ restaurantId: r.id, coords: r.coords, now: deps.now, network: false });

async function discard(deps: AutoDeps, report: RunReport, o: Occasion, reason: AutoReason, detail: string | null = null): Promise<void> {
  if (await discardOccasion(deps, o, reason, [o.status], detail)) report.discarded++;
}

// ─── 17 h : préparer ─────────────────────────────────────────────────────────

function newOccasion(restaurantId: string, step: PlanStep, offerings: Offerings, now: Date): NewOccasion {
  const { candidate, slot } = step;
  const variant = initialVariant(candidate.sourceKey);
  return {
    restaurant_id: restaurantId,
    kind: candidate.kind,
    source_key: candidate.sourceKey,
    label: occasionLabel(slot.facts),
    title: compose(slot.facts, { offerings, dishId: null, variant }).title,
    facts: slot.facts,
    occasion_day: slot.facts.day,
    publish_day: slot.day,
    publish_at: publishAt(slot.day),
    expires_at: slot.expiresAt,
    variant,
    status: "prevu",
    reason: null,
    reason_detail: null,
    post_id: null,
    send_id: null,
    notified_at: null,
    published_at: null,
    published_mode: null,
    modified_at: null,
    refused_via: null,
    decided_by: null,
    decided_at: now.toISOString(),
  };
}

/** Écrit une occasion nouvelle ou en ranime une. `false` : une autre exécution l'a prise. */
async function store(deps: AutoDeps, row: NewOccasion, reviveId: string | null): Promise<boolean> {
  if (reviveId === null) return (await deps.db.insertOccasion(row)) !== null;
  return (await deps.db.updateOccasion(reviveId, { ...row, updated_at: deps.now.toISOString() }, ["ecarte"])) !== null;
}

async function storeDiscarded(deps: AutoDeps, report: RunReport, restaurantId: string, step: PlanStep, reason: AutoReason, detail: string | null, offerings: Offerings): Promise<void> {
  const row: NewOccasion = { ...newOccasion(restaurantId, step, offerings, deps.now), status: "ecarte", reason, reason_detail: detail };
  if (!(await store(deps, row, step.reviveId))) return;
  report.discarded++;
  await deps.posts.addEvent({ postId: null, restaurantId, kind: "auto_ecarte", reason });
}

async function plan(deps: AutoDeps, report: RunReport, settings: AutoSettings, restaurant: AutoRestaurant, today: string): Promise<void> {
  const id = restaurant.id;
  const window = { from: addDays(today, 1), to: addDays(today, HORIZON_DAYS) };

  const candidates: Candidate[] = [];
  for (const kind of settings.kinds) {
    const source = sourceFor(deps, kind);
    if (!source) continue;
    const why = await source.unavailable();
    if (why !== null) {
      if (!report.unavailable.some((u) => u.kind === kind)) {
        report.unavailable.push({ kind, why });
        console.warn(`[articles auto] source « ${kind} » indisponible : ${why}`);
      }
      continue;
    }
    const read = await source.read(context(deps, restaurant), window);
    if (!read.ok) {
      report.errors.push(`${id}, ${kind} : ${read.error}`);
      continue;
    }
    candidates.push(...read.candidates);
  }

  const offerings = await deps.offerings(id).catch(() => NO_OFFERINGS);
  const existing = await deps.db.recentOccasions(id, addDays(today, -45));
  const known = new Map(existing.map((o) => [o.source_key, o]));

  // Le texte d'abord : une occasion que le contrôle refuse ne prend la place d'aucune autre.
  const writable: Candidate[] = [];
  for (const c of candidates) {
    const slot = c.days.find((d) => d.day >= window.from && d.day <= window.to);
    if (!slot) continue;
    const content = compose(slot.facts, { offerings, dishId: null, variant: initialVariant(c.sourceKey) });
    const issues = checkPublication(content, new Set());
    if (issues.length > 0) {
      if (known.has(c.sourceKey)) continue;
      const why = issueReason(issues);
      await storeDiscarded(deps, report, id, { candidate: c, slot, reviveId: null }, why.reason, why.detail, offerings);
      continue;
    }
    // Un jour fermé ne prend la place d'aucun autre. Des horaires illisibles aujourd'hui se revérifient au préavis.
    const days = [];
    for (const d of c.days) {
      if (d.day < window.from || d.day > window.to) continue;
      if ((await deps.opening(id, openingWindow(d.facts, d.day))) !== "ferme") days.push(d);
    }
    if (days.length > 0) writable.push({ ...c, days });
    else if (!c.later && !known.has(c.sourceKey)) {
      await storeDiscarded(deps, report, id, { candidate: c, slot, reviveId: null }, "ferme_ce_jour", null, offerings);
    }
  }

  const result = planOccasions({ today, kinds: settings.kinds, candidates: writable, existing });
  for (const occasionId of result.replace) {
    const o = existing.find((x) => x.id === occasionId);
    if (o) await discard(deps, report, o, "priorite");
  }
  for (const step of result.create) {
    if (await store(deps, newOccasion(id, step, offerings, deps.now), step.reviveId)) report.planned++;
  }
  for (const step of result.discard) await storeDiscarded(deps, report, id, step, step.reason, null, offerings);
}

// ─── 17 h : prévenir pour demain ─────────────────────────────────────────────

async function notifyOne(deps: AutoDeps, report: RunReport, settings: AutoSettings, restaurant: AutoRestaurant, o: Occasion): Promise<void> {
  const source = sourceFor(deps, o.kind);
  if (!source) return discard(deps, report, o, "source_indisponible");
  const check = await source.recheck(context(deps, restaurant), o.facts);
  if (!check.ok) return discard(deps, report, o, check.reason);
  const closed = openingReason(await deps.opening(restaurant.id, openingWindow(o.facts, o.publish_day)));
  if (closed) return discard(deps, report, o, closed);
  const menu = await deps.menu(restaurant.id);
  if (!menu) return discard(deps, report, o, "carte_illisible");
  const offerings = await deps.offerings(restaurant.id).catch(() => NO_OFFERINGS);
  const { content, issues } = composeChecked(o.facts, { menu, offerings, variant: o.variant, day: o.publish_day });
  if (issues.length > 0) {
    const why = issueReason(issues);
    return discard(deps, report, o, why.reason, why.detail);
  }

  // Prendre l'occasion AVANT d'écrire et d'envoyer : une seconde exécution ne trouve plus « prévu ».
  const sendId = crypto.randomUUID();
  const at = deps.now.toISOString();
  const claimed = await deps.db.updateOccasion(o.id, { status: "prevenu", send_id: sendId, notified_at: at, title: content.title, updated_at: at }, ["prevu"]);
  if (!claimed) return;
  try {
    const postId = crypto.randomUUID();
    await deps.posts.insert({
      id: postId,
      restaurant_id: restaurant.id,
      slug: draftSlug(crypto.randomUUID()),
      lang: "fr",
      status: "brouillon",
      draft_title: content.title,
      draft_blocks: content.blocks,
      origin: "auto",
      author_id: null,
      source_credit: sourceCredit(o.kind),
      // L'article d'une offre la suit : il n'est lu que tant qu'elle vaut.
      ...(o.facts.kind === "promo" ? { offer_id: o.facts.offerId } : {}),
    });
    const withPost = (await deps.db.updateOccasion(o.id, { post_id: postId }, ["prevenu"])) ?? { ...claimed, post_id: postId };
    const sent = await deps.notify({ occasion: withPost, content, restaurant, settings, sendId });
    if (!sent.sent) return discard(deps, report, withPost, sent.reason);
    report.notified++;
    await deps.posts.addEvent({ postId, restaurantId: restaurant.id, kind: "auto_prevenu", reason: o.kind });
  } catch (e) {
    const current = await deps.db.occasion(o.id);
    if (current && current.status === "prevenu") await discard(deps, report, current, "erreur");
    throw e;
  }
}

// ─── 10 h : revérifier et publier ────────────────────────────────────────────

async function publishOne(deps: AutoDeps, report: RunReport, o: Occasion, today: string): Promise<void> {
  const id = o.restaurant_id;
  const settings = await deps.db.settings(id);
  if (!isActive(settings)) return discard(deps, report, o, "arret");
  if (!settings.kinds.includes(o.kind)) return discard(deps, report, o, "type_decoche");
  if (o.status === "prevu") return discard(deps, report, o, "non_prevenu");
  if (deps.now.getTime() >= Date.parse(o.expires_at)) return discard(deps, report, o, "heure_passee");
  const restaurant = await deps.restaurant(id);
  if (!restaurant || !restaurant.open) return discard(deps, report, o, "espace_ferme");
  const post = o.post_id ? await deps.posts.get(id, o.post_id) : null;
  if (!post) return discard(deps, report, o, "brouillon_supprime");
  if (post.status === "masque") return discard(deps, report, o, "masque");
  if (post.status !== "brouillon") {
    // Quelqu'un l'a déjà publié (puis peut-être retiré) : on en prend note, on ne republie rien.
    await deps.db.updateOccasion(o.id, { status: "publie", published_mode: "maintenant", published_at: post.published_at, updated_at: deps.now.toISOString() }, ["prevenu"]);
    return;
  }

  const proof = deliveryProof(o.send_id ? await deps.db.sendProof(o.send_id) : null);
  if (!proof.ok) return discard(deps, report, o, proof.reason);

  const source = sourceFor(deps, o.kind);
  if (!source) return discard(deps, report, o, "source_indisponible");
  const check = await source.recheck(context(deps, restaurant), o.facts);
  if (!check.ok) return discard(deps, report, o, check.reason);
  const closed = openingReason(await deps.opening(id, openingWindow(o.facts, o.publish_day)));
  if (closed) return discard(deps, report, o, closed);

  const week = (await deps.db.recentOccasions(id, weekStart(today))).filter(
    (x) => x.id !== o.id && x.status === "publie" && x.published_mode === "auto" && weekStart(x.publish_day) === weekStart(today),
  );
  if (week.filter((x) => x.publish_day === today).length >= MAX_PER_DAY) return discard(deps, report, o, "un_par_jour");
  if (week.length >= MAX_PER_WEEK) return discard(deps, report, o, "limite_semaine");

  const menu = await deps.menu(id);
  if (!menu) return discard(deps, report, o, "carte_illisible");
  const blocks = readBlocks(post.draft_blocks);
  // Les droits sur une photo se confirment en personne (ADR 0111 §5) : jamais par un silence.
  if (photoPaths(blocks).length > 0) return discard(deps, report, o, "photo");
  // Un texte que personne n'a touché ne parle que de ce qui est encore coché.
  if (o.modified_at === null) {
    const offerings = await deps.offerings(id).catch(() => NO_OFFERINGS);
    if (!stillOffered({ title: post.draft_title, blocks }, o.facts, o.variant, offerings)) return discard(deps, report, o, "infos_changees");
  }
  const dishIds = dishIdsOf(menu);
  const issues = checkPublication({ title: post.draft_title, blocks }, dishIds);
  if (issues.length > 0) {
    const why = issueReason(issues);
    return discard(deps, report, o, why.reason, why.detail);
  }

  const at = deps.now.toISOString();
  const claimed = await deps.db.updateOccasion(o.id, { status: "publie", published_at: at, published_mode: "auto", decided_at: at, updated_at: at }, ["prevenu"]);
  if (!claimed) return;
  try {
    const res = await publishPost(deps.posts, {
      restaurantId: id, postId: post.id, userId: null, revision: post.revision, rightsConfirmed: false, dishIds, now: deps.now, expiresAt: o.expires_at,
    });
    if (!res.ok) {
      if (await discardOccasion(deps, claimed, "erreur", ["publie"], res.error.slice(0, 300))) report.discarded++;
      return;
    }
    report.published++;
    await deps.posts.addEvent({ postId: post.id, restaurantId: id, kind: "auto_publie", reason: o.kind });
  } catch (e) {
    if (await discardOccasion(deps, claimed, "erreur", ["publie"])) report.discarded++;
    throw e;
  }
}

// ─── La réserve météo, une heure avant chaque passage ────────────────────────

export type PrefetchReport = { hour: number; acted: boolean; restaurants: number; ready: number; off: string | null; errors: string[] };

/**
 * Une heure avant 10 h et 17 h, à une minute décalée : demander ce que les passages suivants liront en réserve. Les
 * conditions de MET Norway interdisent le trafic à l'heure pile ; les heures montrées au restaurateur ne changent pas.
 * `pause` : un court délai au hasard entre deux demandes.
 */
export async function prefetchWeather(deps: AutoDeps, pause: () => Promise<void> = async () => {}): Promise<PrefetchReport> {
  const hour = brusselsHourOf(deps.now);
  const report: PrefetchReport = { hour, acted: false, restaurants: 0, ready: 0, off: null, errors: [] };
  if (hour !== NOTIFY_HOUR - 1 && hour !== PUBLISH_HOUR - 1) return report;
  report.acted = true;
  const source = sourceFor(deps, "meteo");
  const why = source ? await source.unavailable() : "météo pas branchée";
  if (!source?.prefetch || why !== null) {
    report.off = why ?? "météo pas branchée";
    console.warn(`[articles auto] météo éteinte : ${report.off}`);
    return report;
  }
  for (const settings of await deps.db.enabledSettings()) {
    if (!isActive(settings) || !settings.kinds.includes("meteo")) continue;
    const id = settings.restaurant_id;
    try {
      const restaurant = await deps.restaurant(id);
      if (!restaurant || !restaurant.open) continue;
      report.restaurants++;
      await pause();
      const r = await source.prefetch({ ...context(deps, restaurant), network: true });
      if (r.ok) report.ready++;
      else report.errors.push(`${id} : ${r.error}`);
    } catch (e) {
      console.error(`[articles auto] réserve météo, ${id} :`, e);
      report.errors.push(`${id} : ${(e as Error).message}`);
    }
  }
  return report;
}

// ─── La fin automatique ──────────────────────────────────────────────────────

/** Range les articles échus. La lecture publique les cache déjà sans attendre ce passage. */
async function closeExpired(deps: AutoDeps, report: RunReport): Promise<void> {
  const at = deps.now.toISOString();
  for (const post of await deps.db.expiredPosts(at)) {
    const res = await deps.posts.update(post.id, { status: "retire", withdrawn_at: at, updated_at: at }, { status: "en_ligne" });
    if (!res.ok) continue;
    report.expired++;
    await deps.posts.addEvent({ postId: post.id, restaurantId: post.restaurant_id, kind: "retire", reason: "fin_automatique" });
  }
}

// ─── Le passage ──────────────────────────────────────────────────────────────

export async function runAuto(deps: AutoDeps): Promise<RunReport> {
  const hour = brusselsHourOf(deps.now);
  if (hour !== NOTIFY_HOUR && hour !== PUBLISH_HOUR) return emptyReport(hour, false);
  const report = emptyReport(hour, true);
  const today = brusselsDay(deps.now);
  const step = async (label: string, run: () => Promise<void>) => {
    try {
      await run();
    } catch (e) {
      console.error(`[articles auto] ${label} :`, e);
      report.errors.push(`${label} : ${(e as Error).message}`);
    }
  };

  // D'abord ce qui est dépassé : un jour manqué ne se rattrape pas.
  await step("occasions dépassées", async () => {
    for (const o of await deps.db.pendingOccasions()) {
      if (o.publish_day < today) await step(o.id, () => discard(deps, report, o, "heure_passee"));
    }
  });
  await step("fin automatique", () => closeExpired(deps, report));

  if (hour === PUBLISH_HOUR) {
    const due = (await deps.db.pendingOccasions()).filter((o) => o.publish_day === today);
    report.restaurants = new Set(due.map((o) => o.restaurant_id)).size;
    for (const o of due) await step(`${o.restaurant_id}, publication ${o.id}`, () => publishOne(deps, report, o, today));
    return report;
  }

  const tomorrow = addDays(today, 1);
  for (const settings of await deps.db.enabledSettings()) {
    if (!isActive(settings)) continue;
    const id = settings.restaurant_id;
    await step(id, async () => {
      const restaurant = await deps.restaurant(id);
      // Rien ne tourne sans espace de commande ouvert ET activation.
      if (!restaurant || !restaurant.open) {
        for (const o of await deps.db.pendingOccasions(id)) await discard(deps, report, o, "espace_ferme");
        return;
      }
      report.restaurants++;
      await step(`${id}, préparation`, () => plan(deps, report, settings, restaurant, today));
      const due = (await deps.db.pendingOccasions(id)).filter((o) => o.publish_day === tomorrow && o.status === "prevu");
      for (const o of due) {
        await step(`${id}, préavis ${o.id}`, async () => {
          if (!settings.kinds.includes(o.kind)) return discard(deps, report, o, "type_decoche");
          return notifyOne(deps, report, settings, restaurant, o);
        });
      }
    });
  }
  return report;
}
