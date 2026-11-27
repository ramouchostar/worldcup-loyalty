import { test } from "node:test";
import assert from "node:assert/strict";
import { findOnlinePost, publishPost, saveDraft } from "../service";
import { postCard, publicPost } from "../view";
import { nextVersion, noteDeletion, noteModified, publishNow, refuseOccasion, saveAutoSettings, stopAuto } from "./actions";
import { runAuto } from "./engine";
import { agendaRow, at10, at17, DISH_ID, RESTO, world } from "./testing";
import { TERMS_VERSION } from "./types";

const EVE = "2026-11-27"; // vendredi
const DAY = "2026-11-28"; // samedi
const USER = "gerant-1";

type World = ReturnType<typeof world>;
const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => { assert.ok(r.ok, JSON.stringify(r)); return r as Extract<T, { ok: true }>; };

async function activate(w: World, kinds = ["evenement"]) {
  ok(await saveAutoSettings(w.deps(), { restaurantId: RESTO, userId: USER, kinds, accepted: true }));
}
const run = (w: World, now: Date) => { w.state.now = now; return runAuto(w.deps()); };
const one = (w: World) => { assert.equal(w.list().length, 1, JSON.stringify(w.list())); return w.list()[0]; };

/** Activé, un samedi de brocante, prévenu vendredi à 17 h. */
async function notified() {
  const w = world();
  w.agenda.push(agendaRow(DAY));
  await activate(w);
  await run(w, at17(EVE));
  assert.equal(w.sent.length, 1);
  return w;
}

test("éteinte par défaut : sans activation, rien n'est lu ni écrit ; l'activation demande la phrase", async () => {
  const w = world();
  w.agenda.push(agendaRow(DAY));
  const r = await run(w, at17(EVE));
  assert.equal(r.restaurants, 0);
  assert.equal(w.list().length, 0);

  const refused = await saveAutoSettings(w.deps(), { restaurantId: RESTO, userId: USER, kinds: ["evenement"], accepted: false });
  assert.equal(refused.ok, false);
  // Une source indisponible ne se coche pas.
  const nothing = await saveAutoSettings(w.deps(), { restaurantId: RESTO, userId: USER, kinds: ["meteo", "promo", "match"], accepted: true });
  assert.equal(nothing.ok, false);

  await activate(w, ["evenement", "meteo"]);
  const s = w.settings.get(RESTO)!;
  assert.deepEqual(s.kinds, ["evenement"]);
  assert.deepEqual([s.accepted_by, s.terms_version, s.enabled], [USER, TERMS_VERSION, true]);
  assert.ok(s.accepted_at);
});

test("la tâche n'agit qu'à 10 h et 17 h à Bruxelles, été comme hiver", async () => {
  const w = world();
  w.agenda.push(agendaRow(DAY));
  await activate(w);
  for (const t of ["2026-11-27T15:00:00Z", "2026-11-27T17:00:00Z", "2026-11-27T10:00:00Z", "2026-07-10T16:00:00Z"]) {
    assert.equal((await run(w, new Date(t))).acted, false, t);
  }
  assert.equal(w.list().length, 0);
  assert.equal((await run(w, new Date("2026-07-10T15:00:00Z"))).acted, true); // 17 h l'été
});

test("prévenu la veille à 17 h, publié le jour même à 10 h, une seule fois, avec sa fin et sa source", async () => {
  const w = await notified();
  const o = one(w);
  assert.deepEqual([o.status, o.publish_day, o.kind], ["prevenu", DAY, "evenement"]);
  assert.equal(w.sent[0].sendId, o.send_id);
  const draft = w.posts.get(o.post_id!)!;
  assert.deepEqual([draft.status, draft.origin], ["brouillon", "auto"]);
  assert.ok(draft.draft_blocks.some((b) => b.type === "dish" && b.itemId === DISH_ID));
  assert.equal(await findOnlinePost(w.deps().posts, RESTO, draft.slug), null);

  // Rejouée : ni second message, ni second article.
  await run(w, at17(EVE));
  assert.deepEqual([w.sent.length, w.posts.size, w.list().length], [1, 1, 1]);

  const r = await run(w, at10(DAY));
  assert.equal(r.published, 1);
  const post = w.posts.get(o.post_id!)!;
  assert.equal(post.status, "en_ligne");
  assert.equal(post.expires_at, "2026-11-28T23:00:00.000Z"); // minuit à Bruxelles
  assert.match(post.source_credit!, /visit\.brussels/);
  assert.deepEqual([one(w).status, one(w).published_mode], ["publie", "auto"]);
  assert.equal((await run(w, at10(DAY))).published, 0);
  assert.deepEqual(w.events.filter((e) => e.kind === "publie").map((e) => e.actorId), [null]);
});

test("passé sa fin, aucun client ne le lit, avant même le passage de la tâche ; ensuite il est rangé", async () => {
  const w = await notified();
  await run(w, at10(DAY));
  const post = [...w.posts.values()][0];
  const before = new Date("2026-11-28T22:59:00Z");
  const after = new Date("2026-11-28T23:00:00Z");
  assert.ok(await findOnlinePost(w.deps().posts, RESTO, post.slug, before));
  assert.equal(await findOnlinePost(w.deps().posts, RESTO, post.slug, after), null);
  assert.ok(publicPost(post, new Map(), new Map(), before));
  assert.equal(publicPost(post, new Map(), new Map(), after), null);
  assert.equal(postCard(post, new Map(), after), null);
  assert.equal(w.posts.get(post.id)!.status, "en_ligne");

  const r = await run(w, at10("2026-11-29"));
  assert.equal(r.expired, 1);
  assert.equal(w.posts.get(post.id)!.status, "retire");
  assert.ok(w.events.some((e) => e.kind === "retire" && e.reason === "fin_automatique"));

  // Republié à la main : c'est un article du restaurant, sans fin.
  const again = ok(await publishPost(w.deps().posts, { restaurantId: RESTO, postId: post.id, userId: USER, revision: post.revision, rightsConfirmed: false, dishIds: new Set([DISH_ID]), now: at10("2026-11-30") }));
  assert.equal(again.post.expires_at, null);
});

test("sans message délivré, rien n'est publié, et la raison reste", async () => {
  const cases = [
    [{ status: "sent", delivered_at: null, bounced_at: null, complained_at: null }, "mail_non_confirme"],
    [{ status: "bounced", delivered_at: null, bounced_at: "2026-11-27T16:01:00Z", complained_at: null }, "mail_rebond"],
    [{ status: "failed", delivered_at: null, bounced_at: null, complained_at: null }, "mail_non_parti"],
    [null, "mail_non_parti"],
  ] as const;
  for (const [proof, reason] of cases) {
    const w = world();
    w.agenda.push(agendaRow(DAY));
    w.state.proof = proof;
    await activate(w);
    await run(w, at17(EVE));
    await run(w, at10(DAY));
    assert.deepEqual([one(w).status, one(w).reason], ["ecarte", reason]);
    assert.equal(w.posts.size, 0, "le brouillon non touché est retiré");
  }
  const w = world();
  w.agenda.push(agendaRow(DAY));
  w.state.notifyFails = "sans_adresse";
  await activate(w);
  await run(w, at17(EVE));
  assert.deepEqual([one(w).status, one(w).reason, w.posts.size], ["ecarte", "sans_adresse", 0]);
});

test("revérifié avant de publier : annulé, disparu, périmé, espace fermé, carte, plat", async () => {
  const cases: [string, (w: World) => void][] = [
    ["evenement_annule", (w) => { w.agenda[0].is_canceled = true; w.agenda[0].synced_at = `${DAY}T03:00:00Z`; }],
    ["evenement_disparu", (w) => { w.agenda.length = 0; }],
    ["agenda_perime", (w) => { w.agenda[0].synced_at = "2026-11-20T03:00:00Z"; }],
    ["espace_ferme", (w) => { w.state.open = false; }],
    ["carte_illisible", (w) => { w.state.menu = null; }],
    ["plat_absent", (w) => { w.state.menu = { ...w.state.menu!, categories: [] }; }],
  ];
  for (const [reason, break_] of cases) {
    const w = await notified();
    break_(w);
    const r = await run(w, at10(DAY));
    assert.equal(r.published, 0, reason);
    assert.deepEqual([one(w).status, one(w).reason], ["ecarte", reason]);
    assert.ok(w.events.some((e) => e.kind === "auto_ecarte" && e.reason === reason));
  }
});

test("un jour manqué ne se rattrape pas : jamais prévenu ou heure passée", async () => {
  const w = world();
  w.agenda.push(agendaRow("2026-11-29"));
  await activate(w);
  await run(w, at17(EVE)); // prévu pour dimanche, pas encore prévenu
  assert.equal(one(w).status, "prevu");
  await run(w, at10("2026-11-29")); // la tâche de samedi 17 h a manqué
  assert.deepEqual([one(w).status, one(w).reason, w.sent.length], ["ecarte", "non_prevenu", 0]);

  const late = await notified();
  await run(late, at17("2026-11-30"));
  assert.equal(late.list().find((o) => o.publish_day === DAY)!.reason, "heure_passee");
});

test("« Ne pas publier » : refusé, brouillon retiré, jamais reproposé", async () => {
  const w = await notified();
  ok(await refuseOccasion(w.deps(), one(w), { via: "lien", userId: null }));
  assert.deepEqual([one(w).status, one(w).refused_via, w.posts.size], ["refuse", "lien", 0]);
  ok(await refuseOccasion(w.deps(), one(w), { via: "lien", userId: null })); // deux appuis : même réponse
  await run(w, at10(DAY));
  await run(w, at17(EVE));
  assert.deepEqual([one(w).status, w.sent.length], ["refuse", 1]);
});

test("une modification garde l'échéance, repasse par le contrôle, et un refus ne jette pas le texte", async () => {
  const w = await notified();
  const o = one(w);
  const post = w.posts.get(o.post_id!)!;
  const edited = ok(await saveDraft(w.deps().posts, { restaurantId: RESTO, postId: post.id, revision: 1, raw: { title: "Mon titre", blocks: post.draft_blocks } })).post;
  await noteModified(w.deps(), edited);
  assert.deepEqual([one(w).publish_day, one(w).title, one(w).status], [DAY, "Mon titre", "prevenu"]);
  assert.ok(one(w).modified_at);
  await run(w, at10(DAY));
  assert.equal(w.posts.get(post.id)!.published_title, "Mon titre");

  const bad = await notified();
  const b = bad.posts.get(one(bad).post_id!)!;
  const priced = ok(await saveDraft(bad.deps().posts, { restaurantId: RESTO, postId: b.id, revision: 1, raw: { title: "Menu à 5 €", blocks: b.draft_blocks } })).post;
  await noteModified(bad.deps(), priced);
  await run(bad, at10(DAY));
  assert.deepEqual([one(bad).status, one(bad).reason], ["ecarte", "controle"]);
  assert.match(one(bad).reason_detail!, /prix/);
  assert.equal(bad.posts.get(b.id)!.status, "brouillon", "son texte est gardé");
});

test("une photo ajoutée ne part pas toute seule : les droits se confirment en personne", async () => {
  const w = await notified();
  const post = w.posts.get(one(w).post_id!)!;
  post.draft_blocks.push({ type: "photo", path: `${RESTO}/${post.id}/a.jpg`, alt: "La salle" });
  await run(w, at10(DAY));
  assert.deepEqual([one(w).status, one(w).reason], ["ecarte", "photo"]);
});

test("supprimer le brouillon qui attend vaut un refus", async () => {
  const w = await notified();
  await noteDeletion(w.deps(), { restaurantId: RESTO, postId: one(w).post_id!, userId: USER });
  assert.deepEqual([one(w).status, one(w).refused_via], ["refuse", "console"]);
});

test("« Publier maintenant » : la personne décide, l'article garde sa fin ; un événement annulé l'arrête", async () => {
  const w = await notified();
  w.state.now = new Date("2026-11-27T18:00:00Z");
  const o = one(w);
  const res = ok(await publishNow(w.deps(), o, { userId: USER, revision: 1, rightsConfirmed: false }));
  assert.equal(res.post.status, "en_ligne");
  assert.equal(res.post.expires_at, o.expires_at);
  assert.deepEqual([one(w).status, one(w).published_mode, one(w).decided_by], ["publie", "maintenant", USER]);
  assert.equal((await run(w, at10(DAY))).published, 0);

  const gone = await notified();
  gone.agenda[0].is_canceled = true;
  const refused = await publishNow(gone.deps(), one(gone), { userId: USER, revision: 1, rightsConfirmed: false });
  assert.equal(refused.ok, false);
  assert.equal(one(gone).reason, "evenement_annule");

  // Une version qui a changé entre-temps : rien n'est publié, l'article attend toujours.
  const stale = await notified();
  const no = await publishNow(stale.deps(), one(stale), { userId: USER, revision: 7, rightsConfirmed: false });
  assert.equal(no.ok, false);
  assert.deepEqual([one(stale).status, one(stale).published_mode], ["prevenu", null]);
});

test("« Autre version » : la version suivante des phrases remplace le texte, l'échéance ne bouge pas", async () => {
  const w = await notified();
  const o = one(w);
  const before = w.posts.get(o.post_id!)!.draft_title;
  const res = ok(await nextVersion(w.deps(), { restaurantId: RESTO, postId: o.post_id!, revision: 1 }));
  assert.notEqual(res.post.draft_title, before);
  assert.equal(res.post.revision, 2);
  assert.equal(one(w).variant, (o.variant + 1) % 3);
  assert.equal(one(w).publish_at, o.publish_at);
});

test("arrêter : ce qui attendait ne paraît pas ; rallumer avant le jour le repropose", async () => {
  const w = await notified();
  ok(await stopAuto(w.deps(), { restaurantId: RESTO, userId: USER }));
  assert.deepEqual([one(w).status, one(w).reason, w.posts.size], ["ecarte", "arret", 0]);
  assert.equal(w.settings.get(RESTO)!.disabled_by, USER);
  assert.equal((await run(w, at10(DAY))).published, 0);
  await activate(w);
  await run(w, at17(EVE));
  assert.deepEqual([one(w).status, w.sent.length], ["prevenu", 2]);
});

test("décocher un type écarte ce qui attendait", async () => {
  const w = await notified();
  w.settings.get(RESTO)!.kinds = ["match"];
  await run(w, at10(DAY));
  assert.deepEqual([one(w).status, one(w).reason], ["ecarte", "type_decoche"]);
});

test("un par jour, trois par semaine : le reste est gardé avec sa raison", async () => {
  const w = world();
  // Lundi 30 novembre au dimanche 6 décembre : une brocante chaque jour, deux le mardi.
  const days = ["2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04"];
  for (const [i, day] of days.entries()) w.agenda.push(agendaRow(day, { event_id: `e${i}`, external_id: `e${i}:${day}`, synced_at: `${day}T00:00:00Z` }));
  w.agenda.push(agendaRow("2026-12-01", { event_id: "loin", external_id: "loin:2026-12-01", lat: 50.8603, synced_at: "2026-12-01T00:00:00Z" }));
  await activate(w);
  let published = 0;
  for (const eve of ["2026-11-29", ...days]) {
    for (const r of w.agenda) r.synced_at = `${eve}T00:00:00Z`;
    published += (await run(w, at10(eve))).published;
    await run(w, at17(eve));
  }
  assert.equal(published, 3);
  const reasons = Object.fromEntries(w.list().map((o) => [o.source_key.split(":")[2], o.reason]));
  assert.equal(reasons.loin, "un_par_jour");
  assert.equal(reasons.e3, "limite_semaine");
  assert.equal(reasons.e4, "limite_semaine");
});

test("un nom que le contrôle refuse : pas d'article, la raison est gardée, la place reste libre", async () => {
  const w = world();
  w.agenda.push(agendaRow(DAY, { event_id: "pub", external_id: `pub:${DAY}`, name: "Brocante www.exemple.be", lat: 50.8504 }));
  w.agenda.push(agendaRow(DAY));
  await activate(w);
  await run(w, at17(EVE));
  const refused = w.list().find((o) => o.source_key.includes(":pub:"))!;
  assert.deepEqual([refused.status, refused.reason], ["ecarte", "controle"]);
  assert.match(refused.reason_detail!, /lien/);
  assert.equal(w.list().find((o) => o.source_key.includes(":ev1:"))!.status, "prevenu");
  assert.equal(w.sent.length, 1);
});
