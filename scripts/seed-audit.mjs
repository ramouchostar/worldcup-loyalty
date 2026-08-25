// ============================================================================
// SEED AUDIT — jeu de données à l'échelle pour l'audit fonctionnel 3 rôles.
// Voir docs/testing/mission-audit-seed.md. Option B : prod NAMESPACÉE.
//   - Restos  : id préfixé "zz-test-"   (démontage par préfixe)
//   - Membres : email "@seed.boosteats.test" (démontage par domaine)
//   - Comptes focus à mot de passe connu (login manuel dans chaque rôle)
// Échelle : SEED_SCALE=smoke (défaut, ~3 restos) | full (50 restos / 500+ / 1000+).
// Démontage : scripts/seed-audit-clean.mjs
// ============================================================================
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
if (typeof globalThis.WebSocket === "undefined") { globalThis.WebSocket = class { constructor() {} close() {} }; }
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const PREFIX = "zz-test-";
const DOMAIN = "@seed.boosteats.test";
// Mot de passe des comptes de test : JAMAIS en dur (le repo est public, l'ancienne
// valeur a dû être rotée le 2026-08-21). Lu dans .env.local / l'environnement.
const PW = process.env.SEED_PASSWORD || env.SEED_PASSWORD;
if (!PW || PW.length < 12) { console.error("SEED_PASSWORD manquant ou trop court (≥ 12) — défini-le dans .env.local (voir scripts/rotate-seed-passwords.mjs)."); process.exit(1); }
const POLICY = "2026-01";
const SCALE = process.env.SEED_SCALE === "full" ? "full" : "smoke";
const CFG = SCALE === "full"
  ? { bulkRestos: 47, extraUsers: 510, bulkOrders: [15, 30], focusOrders: 40 }
  : { bulkRestos: 0, extraUsers: 6, bulkOrders: [8, 12], focusOrders: 12 };

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
let seed = 20260801;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const randInt = (a, b) => a + Math.floor(rand() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const weighted = (w) => { const t = w.reduce((s, x) => s + x, 0); let r = rand() * t; for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return i; } return w.length - 1; };
const round2 = (n) => Math.round(n * 100) / 100;
const curvePts = (a) => Math.max(0, Math.round(20 + 4 * Math.pow(a, 0.6))); // m47 points_for_order
const isoDaysAgo = (d) => new Date(Date.now() - d * 86_400_000).toISOString();
const dateDaysAgo = (d) => isoDaysAgo(d).slice(0, 10);

async function insertBatch(table, rows, select) {
  const out = [];
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const q = admin.from(table).insert(chunk);
    const { data, error } = select ? await q.select(select) : await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    if (data) out.push(...data);
  }
  return out;
}

// ── Données de référence ────────────────────────────────────────────────────
const DENSE_SECTORS = ["Molenbeek", "Ixelles", "Schaerbeek"]; // ≥5 restos → repères secteur futurs
const SPARSE_SECTORS = ["Uccle", "Etterbeek", "Saint-Gilles", "Jette", "Forest", "Koekelberg", "Anderlecht"];
const FIRST = ["Yassine", "Sarah", "Mehdi", "Lina", "Omar", "Nora", "Bilal", "Amine", "Leila", "Karim", "Sofia", "Rayan", "Imane", "Adam", "Salma", "Hamza", "Nadia", "Youssef", "Marie", "Lucas", "Emma", "Hugo", "Fatima", "David", "Ines"];
const SCHOOL = ["FR", "NL", "DE"];
const CUISINES = {
  tacos:   [["Tacos M", 7.5, 2.2], ["Tacos L", 9, 2.8], ["Tacos XL", 11, 3.5], ["Frites", 3, 0.8], ["Frites Cheddar", 4.5, 1.3], ["Sauce Algérienne", 0.5, 0.1], ["Coca 33cl", 2.5, 0.4], ["Ice Tea", 2.5, 0.45], ["Tiramisu", 4.5, 1], ["Menu Tacos M", 12, 3.4]],
  burger:  [["Classic Burger", 8.5, 2.5], ["Cheese Burger", 9.5, 2.9], ["Double Smash", 12.5, 4.2], ["Chicken Burger", 9, 2.6], ["Frites Maison", 3.5, 0.9], ["Onion Rings", 4, 1.1], ["Milkshake", 5, 1.2], ["Coca 33cl", 2.5, 0.4], ["Brownie", 4.5, 0.9], ["Menu Classic", 13, 3.8]],
  pizza:   [["Margherita", 9, 2.1], ["Regina", 11, 2.9], ["4 Fromages", 12.5, 3.6], ["Calzone", 12, 3.2], ["Pepperoni", 12, 3.1], ["Tiramisu", 5, 1.1], ["San Pellegrino", 3, 0.6], ["Salade Verte", 4.5, 1], ["Panna Cotta", 5, 1], ["Pizza du Chef", 14, 4]],
  sushi:   [["California 6p", 6.5, 2], ["Saumon Roll 6p", 7.5, 2.6], ["Plateau 18p", 19, 6.5], ["Sashimi", 9, 3.4], ["Soupe Miso", 3.5, 0.7], ["Edamame", 4, 0.9], ["Thé Yuzu", 3, 0.5], ["Mochi", 4.5, 1.2], ["Poke Bowl", 12.5, 4], ["Gyoza 5p", 5.5, 1.6]],
  poulet:  [["Poulet 1/2", 9.5, 3], ["Tenders 5p", 8, 2.4], ["Wings 8p", 8.5, 2.5], ["Frites", 3, 0.8], ["Coleslaw", 3.5, 0.8], ["Sauce Maison", 0.8, 0.15], ["Fanta 33cl", 2.5, 0.4], ["Churros 6p", 4, 0.9], ["Bucket", 22, 7.5], ["Menu Tenders", 12.5, 3.8]],
};
const CUISINE_KEYS = Object.keys(CUISINES);
const TEAM_TYPES = ["ecole", "entreprise", "rue_quartier", "taxis", "autre"];
const TEAM_EMOJI = { ecole: "🎓", entreprise: "🏢", rue_quartier: "🏘️", taxis: "🚕", autre: "👥" };
const TEAM_NAMES = ["Les Affamés", "Team Midi", "Les Voisins", "La Bande", "Les Réguliers", "Squad Resto", "Les Gourmands", "Family Time", "Les Collègues", "Le Crew"];
const FLAGS = ["no_order_key", "high_amount", "too_many_today", "no_receipt", "ocr_failed", "low_confidence", "amount_mismatch", "no_restaurant_header"];
let codeSeq = 0;
const joinCode = () => `ZT${String(codeSeq++).padStart(4, "0")}`; // unique (namespace)
const refCode = (n) => `ZR${String(n).padStart(4, "0")}`;

log(`SEED_SCALE=${SCALE} → ${3 + CFG.bulkRestos} restos, ~${8 + CFG.extraUsers} users.`);

// ── 0. Comptes focus (mot de passe connu) ───────────────────────────────────
async function createUser(email, meta, password) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: meta });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  return data.user.id;
}
const focus = {};
focus.super = await createUser(`super${DOMAIN}`, { display_name: "Super Admin (test)", zones: ["Ixelles"] }, PW);
focus.ownerA = await createUser(`owner-a${DOMAIN}`, { display_name: "Owner A (test)", zones: ["Ixelles"] }, PW);
focus.ownerB = await createUser(`owner-b${DOMAIN}`, { display_name: "Owner B (test)", zones: ["Molenbeek"] }, PW);
focus.ownerC = await createUser(`owner-c${DOMAIN}`, { display_name: "Owner C (test)", zones: ["Schaerbeek"] }, PW);
focus.ownerBulk = await createUser(`owner-bulk${DOMAIN}`, { display_name: "Owner Bulk (test)", zones: ["Forest"] }, PW);
focus.memberA = await createUser(`member-a${DOMAIN}`, { display_name: "Membre A (test)", zones: ["Ixelles", "Molenbeek"] }, PW);
focus.deleteMe = await createUser(`delete-me${DOMAIN}`, { display_name: "Jetable RGPD (test)", zones: ["Uccle"] }, PW);
focus.minor = await createUser(`minor${DOMAIN}`, { display_name: "Mineur (test)", zones: ["Jette"] }, PW);
await admin.from("profiles").update({ is_super_admin: true }).eq("id", focus.super);
await admin.from("profiles").update({ birth_date: dateDaysAgo(11 * 365), is_minor: true, parental_consent_status: "pending", parental_email: `parent${DOMAIN}` }).eq("id", focus.minor);
log(`8 comptes focus créés (mot de passe : ${PW}).`);

// ── 1. Restaurants (focus + bulk) ────────────────────────────────────────────
const FOCUS_RESTOS = [
  { id: `${PREFIX}focus-a`, name: "Focus A — Burger Ixelles", owner: focus.ownerA, plan: "gratuit", cuisine: "burger", sector: "Ixelles", forecast: true },
  { id: `${PREFIX}focus-b`, name: "Focus B — Tacos Molenbeek", owner: focus.ownerB, plan: "croissance", cuisine: "tacos", sector: "Molenbeek", forecast: true },
  { id: `${PREFIX}focus-c`, name: "Focus C — Sushi Schaerbeek", owner: focus.ownerC, plan: "pro", cuisine: "sushi", sector: "Schaerbeek", forecast: true },
];
const restos = FOCUS_RESTOS.map((r) => ({ ...r, status: "active", school: pick(SCHOOL), focusResto: true }));
for (let i = 0; i < CFG.bulkRestos; i++) {
  const cuisine = CUISINE_KEYS[i % CUISINE_KEYS.length];
  // 3 premiers secteurs denses sur-représentés (≥5 restos), sinon secteurs isolés
  const sector = i < 15 ? DENSE_SECTORS[i % 3] : pick(SPARSE_SECTORS);
  const status = i === 0 ? "disabled" : i < 5 ? "pending" : "active";
  const plan = weighted([70, 20, 10]) === 0 ? "gratuit" : weighted([0, 2, 1]) === 1 ? "croissance" : "pro";
  restos.push({
    id: `${PREFIX}${cuisine}-${i + 1}`, name: `${cuisine[0].toUpperCase()}${cuisine.slice(1)} ${sector} ${i + 1}`,
    owner: focus.ownerBulk, plan, cuisine, sector, status, school: pick(SCHOOL),
    forecast: i % 6 === 0, focusResto: false,
  });
}
// is_demo: true (ADR 0033) — sans ça, ces restos "zz-test-*" comptent comme
// réseau réel sur /platform/stats : périmètre par défaut gonflé de 50 restos
// et 1000+ commandes de test, agrégation bien plus lourde que prévu.
await insertBatch("restaurants", restos.map((r) => ({
  id: r.id, name: r.name, sector: r.sector, address: `Rue du Test, ${r.sector}`,
  cuisine_types: [r.cuisine], status: r.status, owner_id: r.owner, school_calendar: r.school,
  is_demo: true,
})));
log(`${restos.length} restos insérés (dont ${restos.filter((r) => r.status === "active").length} actifs, ${restos.filter((r) => r.forecast).length} forecast-ready).`);

// ── 2. Abonnements (plans m48) — gratuit implicite laissé sans ligne parfois ─
const subRows = [];
for (const r of restos) {
  if (r.plan === "gratuit" && !r.focusResto && rand() < 0.7) continue; // teste le "gratuit implicite" (pas de ligne)
  subRows.push({ restaurant_id: r.id, plan: r.plan, status: "active", plan_activated_at: r.plan !== "gratuit" ? isoDaysAgo(30) : null });
}
await insertBatch("restaurant_subscriptions", subRows);
// Quelques essais de fonctionnalité (états futurs du paywall Phase 2)
await insertBatch("feature_trials", [
  { restaurant_id: `${PREFIX}focus-a`, feature: "insights", trial_ends_at: isoDaysAgo(2) },   // expiré → verrouillé
  { restaurant_id: `${PREFIX}focus-a`, feature: "forecast", trial_ends_at: isoDaysAgo(-20) },  // actif → essai
]);
log(`${subRows.length} abonnements + 2 essais insérés.`);

// ── 3. Menus + config ticket + paliers ──────────────────────────────────────
const menuRows = [];
for (const r of restos) {
  const jitter = 0.9 + rand() * 0.25;
  for (const [name, price, cost] of CUISINES[r.cuisine]) {
    menuRows.push({ restaurant_id: r.id, name, category: "Carte", menu_price: round2(price * jitter), cost_price: round2(cost * jitter), is_active: true, reward_eligible: true });
  }
}
const menu = await insertBatch("menu_items", menuRows, "id, restaurant_id, name, menu_price, cost_price");
const menuByResto = new Map();
for (const m of menu) { if (!menuByResto.has(m.restaurant_id)) menuByResto.set(m.restaurant_id, []); menuByResto.get(m.restaurant_id).push(m); }

const cfgRows = [], tierRows = [];
restos.forEach((r, i) => {
  const reliable = i % 7 !== 0; // ~1/7 sans clé fiable → commandes flaggées no_order_key
  cfgRows.push({ restaurant_id: r.id, has_reliable_key: reliable, key_label: reliable ? "N° de commande" : null, key_pattern: reliable ? "\\d{2,5}" : null, key_examples: reliable ? ["1024", "1025"] : [], date_group: null, confirmed_at: isoDaysAgo(20), confirmed_by: r.owner });
  const items = [...(menuByResto.get(r.id) || [])].sort((a, b) => Number(a.cost_price) - Number(b.cost_price));
  const cheapest = items[0], mid = items[Math.floor(items.length / 2)];
  // solo : seuils €, plafond coût 8 % (on lie un article assez bon marché)
  for (const [t, it] of [[10, cheapest], [25, mid], [50, mid]]) tierRows.push({ restaurant_id: r.id, layer: "solo", min_threshold: t, menu_item_id: it?.id ?? null, is_active: true });
  for (const [t] of [[200], [500], [1000]]) tierRows.push({ restaurant_id: r.id, layer: "community", min_threshold: t, menu_item_id: cheapest?.id ?? null, is_active: true });
  for (const [t] of [[150], [400]]) tierRows.push({ restaurant_id: r.id, layer: "saver", min_threshold: t, menu_item_id: mid?.id ?? null, is_active: true });
});
await insertBatch("restaurant_receipt_config", cfgRows);
await insertBatch("reward_tiers", tierRows);
log(`${menu.length} articles, ${cfgRows.length} configs ticket, ${tierRows.length} paliers.`);

// ── 4. Utilisateurs bulk ─────────────────────────────────────────────────────
const users = [focus.memberA, focus.deleteMe, focus.minor]; // membres réutilisables
if (CFG.extraUsers > 0) log(`Création de ${CFG.extraUsers} utilisateurs…`);
for (let i = 0; i < CFG.extraUsers; i += 10) {
  const batch = await Promise.all(Array.from({ length: Math.min(10, CFG.extraUsers - i) }, (_, j) => {
    const n = i + j;
    return admin.auth.admin.createUser({ email: `seed-user-${n}${DOMAIN}`, email_confirm: true, user_metadata: { display_name: `${pick(FIRST)} ${String.fromCharCode(65 + (n % 26))}.`, zones: [pick([...DENSE_SECTORS, ...SPARSE_SECTORS])] } });
  }));
  for (const r of batch) { if (r.error) throw new Error(`createUser bulk: ${r.error.message}`); users.push(r.data.user.id); }
  if ((i + 10) % 100 === 0) log(`  ${i + 10}/${CFG.extraUsers}`);
}

// ── 5. Équipes + adhésions ───────────────────────────────────────────────────
const teamRows = [];
for (const r of restos) {
  const n = r.focusResto ? 4 : randInt(2, 5);
  for (let t = 0; t < n; t++) { const type = pick(TEAM_TYPES); teamRows.push({ name: `${pick(TEAM_NAMES)} ${t + 1}`, restaurant_id: r.id, type, created_by: pick(users), flag_emoji: TEAM_EMOJI[type], is_active: true, zone: r.sector, join_code: joinCode() }); }
}
const teams = await insertBatch("teams", teamRows, "id, restaurant_id");
const teamsByResto = new Map();
for (const t of teams) { if (!teamsByResto.has(t.restaurant_id)) teamsByResto.set(t.restaurant_id, []); teamsByResto.get(t.restaurant_id).push(t.id); }

const membershipRows = [], membersByResto = new Map(restos.map((r) => [r.id, []]));
// member-a : membre de focus-a (équipe) ET focus-b (pour le flux réserve/échange)
for (const rid of [`${PREFIX}focus-a`, `${PREFIX}focus-b`]) { const tid = pick(teamsByResto.get(rid)); membershipRows.push({ user_id: focus.memberA, restaurant_id: rid, team_id: tid }); membersByResto.get(rid).push({ uid: focus.memberA, teamId: tid }); }
for (const uid of users) {
  if (uid === focus.memberA) continue;
  const n = weighted([55, 35, 10]) + 1;
  const chosen = [...restos].filter((r) => r.status === "active").sort(() => rand() - 0.5).slice(0, n);
  for (const r of chosen) {
    const teamId = rand() < 0.85 ? pick(teamsByResto.get(r.id)) : null; // ~15 % sans équipe (état vide)
    membershipRows.push({ user_id: uid, restaurant_id: r.id, team_id: teamId });
    if (teamId) membersByResto.get(r.id).push({ uid, teamId });
  }
}
await insertBatch("memberships", membershipRows);
log(`${teamRows.length} équipes, ${membershipRows.length} adhésions.`);

// ── 6. Commandes (validées + pending par flag + rejetées) + lignes ──────────
const scoreAgg = new Map(); // teamId -> { spent, resto }
const budgetAgg = new Map(); // resto|month -> revenue
let totalOrders = 0, totalItems = 0, dupSeq = 0;
for (const r of restos) {
  const members = membersByResto.get(r.id);
  const items = menuByResto.get(r.id);
  if (!members?.length || !items?.length) continue;
  const nOrders = r.focusResto ? CFG.focusOrders : randInt(...CFG.bulkOrders);
  const orderRows = [], itemsPerOrder = [];
  for (let n = 0; n < nOrders; n++) {
    const m = pick(members);
    const lines = [];
    const k = randInt(1, 3);
    for (let li = 0; li < k; li++) lines.push({ item: pick(items), qty: rand() < 0.2 ? 2 : 1 });
    const amount = round2(lines.reduce((s, l) => s + Number(l.item.menu_price) * l.qty, 0));
    if (amount <= 0 || amount > 500) continue;
    const day = randInt(0, 55);
    orderRows.push({ user_id: m.uid, team_id: m.teamId, restaurant_id: r.id, amount, order_date: dateDaysAgo(day), order_time: `${String(randInt(11, 21)).padStart(2, "0")}:${String(randInt(0, 59)).padStart(2, "0")}`, duplicate_key: `${r.id}:ZT_${dupSeq++}`, status: "validated", validated_at: isoDaysAgo(day), flag_reasons: [], submitted_at: isoDaysAgo(day) });
    itemsPerOrder.push(lines);
    const agg = scoreAgg.get(m.teamId) ?? { spent: 0, pts: 0, resto: r.id }; agg.spent += amount; agg.pts += curvePts(amount); scoreAgg.set(m.teamId, agg);
    const bk = `${r.id}|${dateDaysAgo(day).slice(0, 7)}-01`; budgetAgg.set(bk, (budgetAgg.get(bk) ?? 0) + amount);
  }
  // Focus restos : une commande PENDING par flag + 2 rejetées (revue admin)
  if (r.focusResto) {
    FLAGS.forEach((flag, fi) => {
      const m = pick(members); const amount = flag === "high_amount" ? round2(220 + rand() * 100) : round2(9 + rand() * 20);
      orderRows.push({ user_id: m.uid, team_id: m.teamId, restaurant_id: r.id, amount, order_date: dateDaysAgo(fi), order_time: "12:30", duplicate_key: `${r.id}:ZTF_${dupSeq++}`, status: "pending", flag_reasons: [flag], ocr_amount: flag === "amount_mismatch" ? round2(amount + 5) : amount, ocr_confidence: flag === "low_confidence" ? 55 : 88, submitted_at: isoDaysAgo(fi) });
      itemsPerOrder.push([]);
    });
    for (let x = 0; x < 2; x++) { const m = pick(members); orderRows.push({ user_id: m.uid, team_id: m.teamId, restaurant_id: r.id, amount: round2(10 + rand() * 15), order_date: dateDaysAgo(x + 1), order_time: "19:00", duplicate_key: `${r.id}:ZTR_${dupSeq++}`, status: "rejected", rejection_reason: "Ticket illisible (test)", flag_reasons: ["low_confidence"], submitted_at: isoDaysAgo(x + 1) }); itemsPerOrder.push([]); }
  }
  const inserted = await insertBatch("orders", orderRows, "id, status");
  const itemRows = [];
  inserted.forEach((o, idx) => { if (o.status !== "validated") return; (itemsPerOrder[idx] || []).forEach((l, li) => itemRows.push({ order_id: o.id, line_index: li, raw_name: l.item.name, quantity: l.qty, unit_price: l.item.menu_price, menu_item_id: l.item.id })); });
  if (itemRows.length) await insertBatch("order_items", itemRows);
  totalOrders += inserted.length; totalItems += itemRows.length;
}
log(`${totalOrders} commandes (validées + flags + rejetées), ${totalItems} lignes d'articles.`);

// ── 7. Scores d'équipe + budgets (dont quelques restos > plafond → bonus pause) ─
const memberCount = new Map();
for (const rows of membersByResto.values()) for (const m of rows) memberCount.set(m.teamId, (memberCount.get(m.teamId) ?? 0) + 1);
const scoreRows = [];
scoreAgg.forEach((agg, teamId) => scoreRows.push({ team_id: teamId, restaurant_id: agg.resto, member_count: memberCount.get(teamId) ?? 1, total_spent: round2(agg.spent), score: agg.pts }));
await insertBatch("community_scores", scoreRows);
const budgetRows = [];
let bi = 0;
budgetAgg.forEach((rev, key) => { const [restaurant_id, period_month] = key.split("|"); const over = bi++ % 8 === 0; budgetRows.push({ restaurant_id, period_month, program_revenue: round2(rev), rewards_cost: round2(rev * (over ? 0.11 : 0.03 + rand() * 0.03)) }); });
await insertBatch("reward_budget_tracking", budgetRows);
// Seuils CA (verrouillé/déverrouillé mixtes)
const thrRows = restos.map((r, i) => ({ restaurant_id: r.id, period_label: "Mois en cours", target_revenue: round2(3000 + rand() * 4000), current_revenue: round2(rand() * 3000), is_unlocked: i % 3 !== 0, unlocked_at: i % 3 !== 0 ? isoDaysAgo(10) : null, baseline_weekly_revenue: round2(600 + rand() * 800), growth_target_pct: 0.10 }));
await insertBatch("restaurant_thresholds", thrRows);
log(`${scoreRows.length} scores, ${budgetRows.length} budgets, ${thrRows.length} seuils.`);

// ── 8. Récompenses membre-a (4 états) + pool admin + réserve + coupon ────────
const fa = `${PREFIX}focus-a`, fb = `${PREFIX}focus-b`;
const faItems = menuByResto.get(fa), fbItems = menuByResto.get(fb);
const gift = (arr) => pick(arr).name;
// member-a @ focus-a : available / redeemed / expired / banked (1 seul available)
const maRewards = await insertBatch("pending_rewards", [
  { user_id: focus.memberA, restaurant_id: fa, solo_item: gift(faItems), solo_cost: 1.2, community_item: gift(faItems), community_cost: 1.5, advancement_item: gift(faItems), advancement_cost: 2, status: "available", source: "order", created_at: isoDaysAgo(1) },
  { user_id: focus.memberA, restaurant_id: fa, solo_item: gift(faItems), solo_cost: 1.2, status: "redeemed", source: "order", created_at: isoDaysAgo(9), redeemed_at: isoDaysAgo(9) },
  { user_id: focus.memberA, restaurant_id: fa, solo_item: gift(faItems), solo_cost: 1.2, status: "expired", source: "order", created_at: isoDaysAgo(20) },
  { user_id: focus.memberA, restaurant_id: fa, solo_item: gift(faItems), solo_cost: 1.2, status: "banked", source: "order", created_at: isoDaysAgo(14), banked_at: isoDaysAgo(14) },
], "id, status");
// coupon prêt : cadeau redeemed + token actif (écrans /coupon + /admin/coupon)
const [couponReward] = await insertBatch("pending_rewards", [{ user_id: focus.memberA, restaurant_id: fb, solo_item: gift(fbItems), solo_cost: 1.3, status: "redeemed", source: "order", created_at: isoDaysAgo(0), redeemed_at: isoDaysAgo(0) }], "id");
const COUPON_TOKEN = "zztest-coupon-focusb-membera";
await insertBatch("redemption_tokens", [{ user_id: focus.memberA, reward_id: couponReward.id, restaurant_id: fb, token: COUPON_TOKEN, created_at: isoDaysAgo(0), expires_at: isoDaysAgo(-1) }]);
// réserve : solde de points pour member-a (bank_reward) → flux échange testable
const banked = maRewards.find((r) => r.status === "banked");
await insertBatch("point_transactions", [{ user_id: focus.memberA, restaurant_id: fa, delta: 45, reason: "bank_reward", reward_id: banked?.id ?? null }]);
// pool admin : 1 available pour d'autres membres de focus restos (vue distribution)
const poolRows = [];
for (const rid of [fa, fb, `${PREFIX}focus-c`]) {
  const mem = (membersByResto.get(rid) || []).filter((m) => m.uid !== focus.memberA).slice(0, 4);
  const its = menuByResto.get(rid);
  for (const m of mem) poolRows.push({ user_id: m.uid, restaurant_id: rid, solo_item: gift(its), solo_cost: 1.2, community_item: gift(its), community_cost: 1.4, status: "available", source: "order", created_at: isoDaysAgo(2) });
}
// dédoublonne par (user,resto) pour respecter l'index "1 seul available"
const seenAvail = new Set();
const poolDedup = poolRows.filter((r) => { const k = `${r.user_id}|${r.restaurant_id}`; if (seenAvail.has(k)) return false; seenAvail.add(k); return true; });
await insertBatch("pending_rewards", poolDedup);
log(`Récompenses : member-a 4 états + coupon prêt (${COUPON_TOKEN}) + réserve + ${poolDedup.length} au pool admin.`);

// ── 9. Feedback (baromètre + fil) ───────────────────────────────────────────
const fbRows = [];
for (const rid of [fa, fb, `${PREFIX}focus-c`]) {
  const mems = (membersByResto.get(rid) || []).slice(0, 6);
  mems.forEach((m, i) => {
    const incident = i % 2 === 0;
    fbRows.push({ user_id: m.uid, restaurant_id: rid, sentiment: incident ? "incident" : "encouragement", dimensions: incident ? ["service", "attente"] : [], comment: incident ? "Attente un peu longue le midi (test)." : "Super accueil, merci ! (test)", is_anonymous: i % 3 === 0, contact_opt_in: incident, status: i === 0 ? "resolved" : "new", moderation_status: "visible", created_at: isoDaysAgo(i + 1), occurred_at: incident ? isoDaysAgo(i + 1) : null });
  });
}
const fbIns = await insertBatch("quality_feedback", fbRows, "id, restaurant_id, user_id, sentiment");
const msgRows = [];
fbIns.slice(0, 4).forEach((f) => { msgRows.push({ feedback_id: f.id, restaurant_id: f.restaurant_id, sender: "member", body: "Merci de votre retour.", channel: "in_app" }); if (f.sentiment === "incident") msgRows.push({ feedback_id: f.id, restaurant_id: f.restaurant_id, sender: "establishment", body: "Désolé, on améliore le service du midi. (test)", channel: "in_app" }); });
await insertBatch("feedback_messages", msgRows);
log(`${fbIns.length} feedbacks, ${msgRows.length} messages.`);

// ── 10. Parrainage (lien + conversions) ─────────────────────────────────────
await insertBatch("referral_links", [{ user_id: focus.memberA, restaurant_id: fa, code: refCode(1), clicks: 12, conversions: 3 }]);
const refereePool = users.filter((u) => u !== focus.memberA).slice(0, 3);
await insertBatch("referrals", refereePool.map((uid) => ({ referrer_id: focus.memberA, referee_id: uid, restaurant_id: fa, referred_at: isoDaysAgo(5) })));
log(`Parrainage : 1 lien + ${refereePool.length} conversions.`);

// ── 11. Micro-récompenses (définitions + claim pending) ─────────────────────
const microDefs = [];
for (const rid of [fa, fb]) microDefs.push(
  { type: "google_review", title: "Avis Google", description: "Laisse un avis Google", gift_item: "Boisson offerte", gift_cost_euros: 0.5, is_active: true, restaurant_id: rid },
  { type: "instagram_follow", title: "Suivi Instagram", description: "Suis-nous sur Instagram", gift_item: "Sauce offerte", gift_cost_euros: 0.2, is_active: true, restaurant_id: rid },
);
await insertBatch("micro_rewards", microDefs);
await insertBatch("micro_reward_claims", [{ user_id: focus.memberA, reward_type: "google_review", proof_url: "https://example.test/proof", status: "pending", restaurant_id: fa }]);
log(`${microDefs.length} micro-récompenses + 1 claim pending.`);

// ── 12. Ventes caisse (forecast) + événement local ──────────────────────────
const salesRows = [], evtRows = [];
for (const r of restos.filter((x) => x.forecast)) {
  const imp = await insertBatch("sales_imports", [{ restaurant_id: r.id, filename: "seed.csv", row_count: 42, date_min: dateDaysAgo(42), date_max: dateDaysAgo(0), imported_by: r.owner }], "id");
  for (let d = 0; d < 42; d++) { const wd = (new Date(isoDaysAgo(d)).getUTCDay() + 6) % 7; const base = 500 + (wd >= 4 ? 300 : 0); salesRows.push({ restaurant_id: r.id, sold_on: dateDaysAgo(d), amount: round2(base + rand() * 400), source_import_id: imp[0].id }); }
  evtRows.push({ restaurant_id: r.id, starts_on: dateDaysAgo(-7), ends_on: dateDaysAgo(-6), label: "Braderie de quartier (test)", expected_effect: "up", created_by: r.owner });
}
if (salesRows.length) await insertBatch("restaurant_sales", salesRows);
if (evtRows.length) await insertBatch("restaurant_events", evtRows);
log(`${salesRows.length} ventes caisse (${restos.filter((x) => x.forecast).length} restos forecast) + ${evtRows.length} événements.`);

// ── 13. Consentements (écran /compte) ───────────────────────────────────────
const consentRows = [];
for (const uid of [focus.memberA, focus.deleteMe, ...users.slice(0, 20)]) {
  consentRows.push({ user_id: uid, purpose: "programme", granted: true, policy_version: POLICY, source: "seed" });
  consentRows.push({ user_id: uid, purpose: "marketing_push", granted: rand() < 0.5, policy_version: POLICY, source: "seed" });
  consentRows.push({ user_id: uid, purpose: "insights_commerciaux", granted: rand() < 0.4, policy_version: POLICY, source: "seed" });
}
await insertBatch("consents", consentRows);
log(`${consentRows.length} consentements.`);

// ── Récapitulatif ────────────────────────────────────────────────────────────
log("");
log(`✅ SEED ${SCALE.toUpperCase()} TERMINÉ`);
log(`   Restos ${restos.length} | Users ${users.length + 5} | Commandes ${totalOrders}`);
log(`   Comptes focus (mdp ${PW}) :`);
log(`     super${DOMAIN}  (super-admin → /platform, flip de plan)`);
log(`     owner-a/b/c${DOMAIN}  (admins de focus-a[gratuit]/b[croissance]/c[pro])`);
log(`     member-a${DOMAIN}  (membre riche : 4 états de cadeaux, réserve, équipe, parrainage)`);
log(`     delete-me${DOMAIN}  (test suppression RGPD) | minor${DOMAIN} (contrôle d'âge)`);
log(`   Coupon prêt : /coupon/${COUPON_TOKEN}  et  /admin/coupon/${COUPON_TOKEN}`);
