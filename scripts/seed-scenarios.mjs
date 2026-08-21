// ============================================================================
// SEED SCÉNARIOS — transforme le jeu de données d'audit (scripts/seed-audit.mjs,
// plat : ~20-50 commandes partout) en RESTOS-SCÉNARIOS aux volumes ronds dont le
// NOM dit ce qu'ils permettent de tester (certaines fonctionnalités ne
// s'activent qu'au-delà d'un seuil de données). Voir docs/testing/restos-scenarios.md.
//
// IDEMPOTENT : chaque cible est un « top-up » (on complète jusqu'au volume
// voulu, jamais de doublon) — rejouable sans risque.
// Même espace de noms que le seed d'audit (restos zz-test-*, comptes
// @seed.boosteats.test) → scripts/seed-audit-clean.mjs démonte tout.
// Les triggers DB (m27 memberships → member_count ; m35/m47/m49 orders →
// total_spent + score) font les calculs : on n'écrit JAMAIS community_scores
// à la main, sauf la ligne à zéro d'une nouvelle équipe (comme createTeam).
// ============================================================================
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
if (typeof globalThis.WebSocket === "undefined") { globalThis.WebSocket = class { constructor() {} close() {} }; }
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const PREFIX = "zz-test-";
const DOMAIN = "@seed.boosteats.test";
// Mot de passe des comptes de test : JAMAIS en dur (repo public) — .env.local / env.
const PW = process.env.SEED_PASSWORD || env.SEED_PASSWORD;
if (!PW || PW.length < 12) { console.error("SEED_PASSWORD manquant ou trop court (≥ 12) — défini-le dans .env.local (voir scripts/rotate-seed-passwords.mjs)."); process.exit(1); }
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let seed = 20260821;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const randInt = (a, b) => a + Math.floor(rand() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const round2 = (n) => Math.round(n * 100) / 100;
const isoDaysAgo = (d) => new Date(Date.now() - d * 86_400_000).toISOString();
const dateDaysAgo = (d) => isoDaysAgo(d).slice(0, 10);
const month = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" }).slice(0, 7);
const uniq = `${Date.now().toString(36)}`;
let seq = 0;

async function all(table, select, filter) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = admin.from(table).select(select).range(from, from + 999);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}
async function insertBatch(table, rows, select) {
  const out = [];
  for (let i = 0; i < rows.length; i += 500) {
    const q = admin.from(table).insert(rows.slice(i, i + 500));
    const { data, error } = select ? await q.select(select) : await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    if (data) out.push(...data);
  }
  return out;
}
const must = async (p, label) => { const { error } = await p; if (error) throw new Error(`${label}: ${error.message}`); };

// ── Scénarios ───────────────────────────────────────────────────────────────
const R = (s) => `${PREFIX}${s}`;
const SCENARIOS = {
  [R("focus-a")]:   { name: "Pizza · 1000 tickets · 300 clients · tout activé", plan: "pro",        members: 300, orders: 1000, salesDays: 84, feedback: 40, scans: 450, trials: "clear" },
  [R("focus-b")]:   { name: "Burger · 300 tickets · 300 clients · paywalls",    plan: "gratuit",    members: 300, orders: 300,  scans: 450, trials: "expired" },
  [R("focus-c")]:   { name: "Tacos · 100 tickets · 40 clients · croissance",    plan: "croissance", members: 40,  orders: 100 },
  [R("pizza-8")]:   { name: "Seuils limite · 30 tickets · 20 clients",           plan: "gratuit",    orders: 30 },
  [R("tacos-1")]:   { name: "Caisse seule · 0 ticket · ventes 7 sem",            status: "active" },
  [R("sushi-4")]:   { name: "Neuf · 0 ticket · 0 client",                         deleteTeams: true },
  // 3 équipes d'origine (≈142 membres) + 10 équipes planifiées (360) → 500+ clients
  [R("poulet-25")]: { name: "Équipes · 13 équipes · 500 clients · paliers",       plan: "gratuit",    members: 520, teamsScenario: true },
  [R("burger-27")]: { name: "Multi-gérant 1/3 · Burger Jette",     multiOwner: true },
  [R("burger-7")]:  { name: "Multi-gérant 2/3 · Burger Molenbeek", multiOwner: true },
  [R("burger-22")]: { name: "Multi-gérant 3/3 · Burger Forest",    multiOwner: true },
};
// Équipes du scénario « Équipes » : [nom, type, emoji, taille cible, commandes cibles]
const TEAM_PLAN = [
  ["Lycée Géant",        "ecole",        "🎓", 150, 400], // franchit tous les paliers (score + team_tiers 3000 €)
  ["Bureau Nord",        "entreprise",   "🏢", 60,  120], // palier intermédiaire
  ["Rue des Tilleuls",   "rue_quartier", "🏘️", 60,  11],  // juste SOUS le 1er palier score (≈ 480 pts < 500)
  ["Taxis de la Gare",   "taxis",        "🚕", 25,  20],
  ["Collège du Parc",    "ecole",        "🎓", 20,  8],
  ["Les Voisins du 12",  "rue_quartier", "🏘️", 20,  5],
  ["Start-up Loft",      "entreprise",   "🏢", 15,  3],
  ["Trio du Jeudi",      "autre",        "👥", 5,   2],
  ["Duo Midi",           "autre",        "👥", 3,   0],
  ["Solo Fondateur",     "autre",        "👥", 2,   0],
];
const FEATURES = ["forecast", "sales", "insights", "broadcast_scheduled", "barometer_advanced", "sector_benchmarks"];
const DIMS = ["accuracy", "wait", "quality", "welcome"]; // lib/feedback-constants.ts

// ── Chargement ──────────────────────────────────────────────────────────────
const restos = await all("restaurants", "id, name, status, owner_id", (q) => q.like("id", `${PREFIX}%`));
const byId = new Map(restos.map((r) => [r.id, r]));
const pool = await all("profiles", "id, email", (q) => q.ilike("email", `%${DOMAIN}`));
const poolIds = pool.map((p) => p.id);
const findUser = (email) => pool.find((p) => p.email === email)?.id ?? null;
log(`${restos.length} restos de test, ${pool.length} comptes de seed.`);

// ── 0. Compte owner-multi (un gérant, plusieurs restos) ─────────────────────
let ownerMulti = findUser(`owner-multi${DOMAIN}`);
if (!ownerMulti) {
  const { data, error } = await admin.auth.admin.createUser({ email: `owner-multi${DOMAIN}`, password: PW, email_confirm: true, user_metadata: { display_name: "Owner Multi (test)", zones: ["Jette"] } });
  if (error) throw new Error(`owner-multi: ${error.message}`);
  ownerMulti = data.user.id; pool.push({ id: ownerMulti, email: `owner-multi${DOMAIN}` });
  log("compte owner-multi créé");
}

// ── 1. Boucle par scénario ──────────────────────────────────────────────────
const report = [];
for (const [rid, sc] of Object.entries(SCENARIOS)) {
  const resto = byId.get(rid);
  if (!resto) { log(`⚠️  ${rid} introuvable — ignoré`); continue; }
  const patch = { name: sc.name };
  if (sc.status) patch.status = sc.status;
  if (sc.multiOwner) patch.owner_id = ownerMulti;
  await must(admin.from("restaurants").update(patch).eq("id", rid), `rename ${rid}`);

  if (sc.plan) await must(admin.from("restaurant_subscriptions").upsert({ restaurant_id: rid, plan: sc.plan, status: "active", plan_activated_at: sc.plan !== "gratuit" ? isoDaysAgo(30) : null, updated_at: new Date().toISOString() }, { onConflict: "restaurant_id" }), `plan ${rid}`);
  if (sc.trials === "clear") await must(admin.from("feature_trials").delete().eq("restaurant_id", rid), `trials ${rid}`);
  if (sc.trials === "expired") await must(admin.from("feature_trials").upsert(FEATURES.map((f) => ({ restaurant_id: rid, feature: f, trial_ends_at: isoDaysAgo(1) })), { onConflict: "restaurant_id,feature" }), `trials ${rid}`);
  if (sc.scans) await must(admin.from("scan_meter").upsert({ restaurant_id: rid, month, count: sc.scans, updated_at: new Date().toISOString() }, { onConflict: "restaurant_id,month" }), `scans ${rid}`);

  if (sc.deleteTeams) {
    const teams = await all("teams", "id", (q) => q.eq("restaurant_id", rid));
    if (teams.length) {
      const ids = teams.map((t) => t.id);
      await must(admin.from("memberships").delete().in("team_id", ids), "memberships");
      await must(admin.from("community_scores").delete().in("team_id", ids), "community_scores");
      await must(admin.from("teams").delete().in("id", ids), "teams");
    }
  }

  // Menu + équipes + adhésions existantes
  const menu = await all("menu_items", "id, name, menu_price", (q) => q.eq("restaurant_id", rid).eq("is_active", true));
  let teams = await all("teams", "id, name", (q) => q.eq("restaurant_id", rid).eq("is_active", true));
  const memberships = await all("memberships", "user_id, team_id", (q) => q.eq("restaurant_id", rid));
  const memberSet = new Set(memberships.map((m) => m.user_id));

  // Scénario Équipes : créer les équipes manquantes + ligne de score à zéro
  const teamTargets = new Map(); // teamId -> { size, orders }
  if (sc.teamsScenario) {
    const existing = new Map(teams.map((t) => [t.name, t.id]));
    const toCreate = TEAM_PLAN.filter(([n]) => !existing.has(n));
    if (toCreate.length) {
      const created = await insertBatch("teams", toCreate.map(([n, type, emoji]) => ({ name: n, restaurant_id: rid, type, created_by: pick(poolIds), flag_emoji: emoji, is_active: true, zone: "Jette", join_code: `ZS${String(seq++).padStart(4, "0")}${uniq.slice(-2)}`.toUpperCase().slice(0, 10) })), "id, name");
      await insertBatch("community_scores", created.map((t) => ({ team_id: t.id, restaurant_id: rid, member_count: 0, total_spent: 0, score: 0 })));
      for (const t of created) existing.set(t.name, t.id);
    }
    teams = await all("teams", "id, name", (q) => q.eq("restaurant_id", rid).eq("is_active", true));
    for (const [n, , , size, orders] of TEAM_PLAN) teamTargets.set(existing.get(n), { size, orders });
    // paliers d'équipe (couche 3) : 500 € → 10 %, 1500 € → 15 %, 3000 € → article offert
    const cheapest = [...menu].sort((a, b) => Number(a.menu_price) - Number(b.menu_price))[0];
    await must(admin.from("team_tiers").upsert([
      { restaurant_id: rid, threshold_spent: 500,  reward_kind: "percent",   percent_value: 10, is_active: true },
      { restaurant_id: rid, threshold_spent: 1500, reward_kind: "percent",   percent_value: 15, is_active: true },
      { restaurant_id: rid, threshold_spent: 3000, reward_kind: "free_item", menu_item_id: cheapest?.id ?? null, is_active: true },
    ], { onConflict: "restaurant_id,threshold_spent" }), "team_tiers");
  }

  // Top-up adhésions
  let addedMembers = 0;
  if (sc.members && memberSet.size < sc.members) {
    const candidates = poolIds.filter((u) => !memberSet.has(u)).sort(() => rand() - 0.5);
    const need = sc.members - memberSet.size;
    const rows = [];
    if (sc.teamsScenario) {
      // Remplir chaque équipe jusqu'à sa taille cible, le reste sans équipe
      const current = new Map();
      for (const m of memberships) if (m.team_id) current.set(m.team_id, (current.get(m.team_id) ?? 0) + 1);
      let ci = 0;
      for (const [tid, tg] of teamTargets) {
        let have = current.get(tid) ?? 0;
        while (have < tg.size && ci < candidates.length && rows.length < need) { rows.push({ user_id: candidates[ci++], restaurant_id: rid, team_id: tid }); have++; }
      }
      while (rows.length < need && ci < candidates.length) rows.push({ user_id: candidates[ci++], restaurant_id: rid, team_id: null });
    } else {
      for (let i = 0; i < need && i < candidates.length; i++) rows.push({ user_id: candidates[i], restaurant_id: rid, team_id: teams.length && rand() < 0.85 ? pick(teams).id : null });
    }
    await insertBatch("memberships", rows);
    for (const r of rows) { memberships.push(r); memberSet.add(r.user_id); }
    addedMembers = rows.length;
  }

  // Top-up commandes validées (avec lignes d'articles → Opportunités/Ventes)
  const existingOrders = await all("orders", "id, team_id", (q) => q.eq("restaurant_id", rid).eq("status", "validated"));
  let addedOrders = 0, addedItems = 0;
  const makeOrders = (n, membersSubset) => {
    const orderRows = [], lines = [];
    for (let i = 0; i < n && membersSubset.length && menu.length; i++) {
      const m = pick(membersSubset);
      const k = randInt(1, 3), ls = [];
      for (let li = 0; li < k; li++) ls.push({ item: pick(menu), qty: rand() < 0.2 ? 2 : 1 });
      const amount = round2(ls.reduce((s, l) => s + Number(l.item.menu_price) * l.qty, 0));
      if (amount <= 0 || amount > 500) { i--; continue; }
      const day = Math.floor(Math.pow(rand(), 1.3) * 89); // plus dense récemment, étalé sur 90 j
      orderRows.push({ user_id: m.user_id, team_id: m.team_id, restaurant_id: rid, amount, order_date: dateDaysAgo(day), order_time: `${String(randInt(11, 21)).padStart(2, "0")}:${String(randInt(0, 59)).padStart(2, "0")}`, duplicate_key: `${rid}:ZS${uniq}_${seq++}`, status: "validated", validated_at: isoDaysAgo(day), flag_reasons: [], submitted_at: isoDaysAgo(day) });
      lines.push(ls);
    }
    return { orderRows, lines };
  };
  const flush = async ({ orderRows, lines }) => {
    if (!orderRows.length) return;
    const ins = await insertBatch("orders", orderRows, "id");
    const itemRows = [];
    ins.forEach((o, idx) => (lines[idx] || []).forEach((l, li) => itemRows.push({ order_id: o.id, line_index: li, raw_name: l.item.name, quantity: l.qty, unit_price: l.item.menu_price, menu_item_id: l.item.id })));
    if (itemRows.length) await insertBatch("order_items", itemRows);
    addedOrders += ins.length; addedItems += itemRows.length;
  };
  if (sc.teamsScenario) {
    const perTeam = new Map();
    for (const o of existingOrders) if (o.team_id) perTeam.set(o.team_id, (perTeam.get(o.team_id) ?? 0) + 1);
    for (const [tid, tg] of teamTargets) {
      const have = perTeam.get(tid) ?? 0;
      const mem = memberships.filter((m) => m.team_id === tid);
      if (tg.orders > have && mem.length) await flush(makeOrders(tg.orders - have, mem));
    }
  } else if (sc.orders && existingOrders.length < sc.orders) {
    await flush(makeOrders(sc.orders - existingOrders.length, memberships));
  }

  // Ventes caisse (Prévisions) : compléter jusqu'à N jours d'historique
  let addedSales = 0;
  if (sc.salesDays) {
    const sales = await all("restaurant_sales", "sold_on", (q) => q.eq("restaurant_id", rid));
    const have = new Set(sales.map((s) => s.sold_on));
    const missing = [];
    for (let d = 0; d < sc.salesDays; d++) if (!have.has(dateDaysAgo(d))) missing.push(d);
    if (missing.length) {
      const imp = await insertBatch("sales_imports", [{ restaurant_id: rid, filename: "seed-scenarios.csv", row_count: missing.length, date_min: dateDaysAgo(Math.max(...missing)), date_max: dateDaysAgo(Math.min(...missing)), imported_by: resto.owner_id }], "id");
      await insertBatch("restaurant_sales", missing.map((d) => { const wd = (new Date(isoDaysAgo(d)).getUTCDay() + 6) % 7; const base = 500 + (wd >= 4 ? 300 : 0); return { restaurant_id: rid, sold_on: dateDaysAgo(d), amount: round2(base + rand() * 400), source_import_id: imp[0].id }; }));
      addedSales = missing.length;
    }
  }

  // Retours (Baromètre) : compléter jusqu'à N, membres éligibles (≥ 3 commandes)
  let addedFeedback = 0;
  if (sc.feedback) {
    const { count } = await admin.from("quality_feedback").select("id", { count: "exact", head: true }).eq("restaurant_id", rid);
    const need = sc.feedback - (count ?? 0);
    if (need > 0) {
      const orders = await all("orders", "user_id", (q) => q.eq("restaurant_id", rid).eq("status", "validated"));
      const per = new Map(); for (const o of orders) per.set(o.user_id, (per.get(o.user_id) ?? 0) + 1);
      const eligible = [...per].filter(([, n]) => n >= 3).map(([u]) => u);
      const rows = [];
      for (let i = 0; i < need && eligible.length; i++) {
        const incident = rand() < 0.45, day = Math.floor(rand() * 60);
        rows.push({ user_id: eligible[i % eligible.length], restaurant_id: rid, sentiment: incident ? "incident" : "encouragement", dimensions: incident ? [pick(DIMS), pick(DIMS)].filter((v, j, a) => a.indexOf(v) === j) : [], comment: incident ? pick(["Attente un peu longue le midi (test).", "Commande incomplète, frites oubliées (test).", "Burger tiède ce soir (test)."]) : pick(["Super accueil, merci ! (test)", "Toujours aussi bon (test)", "Équipe au top (test)"]), is_anonymous: incident && rand() < 0.7, contact_opt_in: incident && rand() < 0.4, status: rand() < 0.5 ? "resolved" : "new", moderation_status: "visible", created_at: isoDaysAgo(day), occurred_at: incident ? isoDaysAgo(day) : null });
      }
      await insertBatch("quality_feedback", rows);
      addedFeedback = rows.length;
    }
  }

  // member-a inscrit aussi en focus-c → 3 restos (sélecteur d'établissement côté membre)
  if (rid === R("focus-c")) {
    const memberA = findUser(`member-a${DOMAIN}`);
    if (memberA && !memberSet.has(memberA)) { await insertBatch("memberships", [{ user_id: memberA, restaurant_id: rid, team_id: teams[0]?.id ?? null }]); addedMembers++; }
  }

  report.push({ rid, name: sc.name, addedMembers, addedOrders, addedItems, addedSales, addedFeedback });
  log(`✓ ${sc.name}  (+${addedMembers} membres, +${addedOrders} cmd, +${addedItems} lignes, +${addedSales} ventes, +${addedFeedback} retours)`);
}

// ── 2. Fond réseau : tous les autres zz-test-* ──────────────────────────────
let renamed = 0;
for (const r of restos) {
  if (SCENARIOS[r.id] || r.name.startsWith("Fond réseau")) continue;
  await must(admin.from("restaurants").update({ name: `Fond réseau — ${r.name}` }).eq("id", r.id), `fond ${r.id}`);
  renamed++;
}
log(`${renamed} restos renommés « Fond réseau — … »`);

log("");
log("✅ SCÉNARIOS PRÊTS");
for (const r of report) log(`   ${r.rid.padEnd(22)} → ${r.name}`);
log(`   owner-multi${DOMAIN} (mdp ${PW}) gère les 3 « Multi-gérant » · member-a est membre de 3 restos`);
