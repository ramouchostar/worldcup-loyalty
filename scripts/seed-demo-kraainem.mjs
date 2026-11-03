// ============================================================================
// SEED DÉMO KRAAINEM — trois universes parallèles du même restaurant, depuis le
// lancement du programme (2026-07-03) : un par HYPOTHÈSE d'adoption (faible /
// moyenne / forte), construites avec le propriétaire le 2026-11-03.
//
//   demo-kraainem-faible   les caissiers en parlent de temps en temps
//   demo-kraainem-moyenne  ils en parlent souvent
//   demo-kraainem-forte    ils en parlent systématiquement + les équipes
//                          (hautes écoles, université, hôpital, secondaires) tournent
//
// Les paramètres de chaque hypothèse (membres captés, conquête de la zone,
// hausse de fréquence, commandes additionnelles) sortent d'un seul tableau :
// SCENARIOS ci-dessous. Hypothèses de départ, à recalibrer avec le pilote.
//
// SÛR PAR DÉFAUT : sans `--apply`, le script LIT seulement (menu, paliers et
// config de Kraainem), simule tout en mémoire et affiche ce qu'il écrirait.
//   node scripts/seed-demo-kraainem.mjs                     → à blanc, 3 démos
//   node scripts/seed-demo-kraainem.mjs --only=faible       → à blanc, une démo
//   node scripts/seed-demo-kraainem.mjs --only=faible --apply
//
// Périmètre : restos `demo-kraainem-*` (is_demo, ADR 0033 : invisibles du public
// et des chiffres réseau, accessibles par leur URL directe) + comptes
// `@demo-kraainem.boosteats.test`. Jamais de modification de kraainem ni d'un
// autre établissement. Refuse d'écrire si la démo existe déjà : lancer
// scripts/seed-demo-kraainem-clean.mjs d'abord (pas de top-up, pas d'ambiguïté).
//
// Les triggers de la base calculent member_count, total_spent et score à partir
// des adhésions et des commandes : on n'écrit JAMAIS community_scores à la main,
// sauf la ligne à zéro d'une nouvelle équipe (comme createTeam).
//
// Le CA du jour passe par la RPC save_daily_revenue_console (celle de la console),
// qui garde daily_revenue_entries et restaurant_sales cohérents.
//
// DÉPÔT PUBLIC : aucun chiffre client dans ce fichier. Le profil réel de la caisse
// de Kraainem (CA caisse d'octobre jour par jour, nombre de commandes, ticket moyen,
// plateformes, estimations de clientèle) vit dans un fichier LOCAL non versionné,
// `scripts/.demo-kraainem-profil.json` (ou DEMO_PROFILE=<chemin>) — forme dans
// PROFIL_EXEMPLE plus bas. Plateformes et CA avant octobre : HYPOTHÈSES de démo.
//
// Cadeaux (ADR 0061) : les points (10 par euro) sont crédités par le trigger de la
// base à l'insertion de chaque ticket validé ; seul le PREMIER ticket d'un membre
// reçoit un cadeau d'accueil. Les échanges au catalogue et les cadeaux d'équipe
// (franchissement de palier) ne sont pas simulés ici.
// ============================================================================
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const ARGS = process.argv.slice(2);
const APPLY = ARGS.includes("--apply");
const ONLY = (ARGS.find((a) => a.startsWith("--only=")) ?? "").slice(7) || null;

const ENV_FILE = process.env.ENV_FILE || ".env.local";
const env = Object.fromEntries(
  readFileSync(ENV_FILE, "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
if (typeof globalThis.WebSocket === "undefined") { globalThis.WebSocket = class { constructor() {} close() {} }; }
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const PREFIX = "demo-kraainem-";
const DOMAIN = "@demo-kraainem.boosteats.test";
const SOURCE_ID = "kraainem";
// Mot de passe des comptes de démo : JAMAIS en dur (repo public) — .env.local / env.
const PW = process.env.SEED_PASSWORD || env.SEED_PASSWORD;
if (APPLY && (!PW || PW.length < 12)) { console.error("SEED_PASSWORD manquant ou trop court (≥ 12) — défini-le dans .env.local."); process.exit(1); }

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const round2 = (n) => Math.round(n * 100) / 100;
const makeRng = (s) => () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const wdOf = (iso) => (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 = lundi
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" });

// ── Profil client (LOCAL, jamais versionné : le dépôt est public) ───────────
const PROFIL_EXEMPLE = { octCaisse: "[31 CA caisse du 1er au 31 octobre 2026, TVA comprise]", ordersPerMonth: "commandes caisse / mois", ticketMean: "ticket moyen caisse", platformMonthly: "CA plateformes / mois (hypothèse)", regulars: "clients habituels / mois (hypothèse)", pool: "personnes de la zone qui ne viennent pas encore (hypothèse)" };
const PROFIL_FILE = process.env.DEMO_PROFILE || "scripts/.demo-kraainem-profil.json";
let profil;
try { profil = JSON.parse(readFileSync(PROFIL_FILE, "utf8")); } catch (e) {
  console.error(`Profil client introuvable ou illisible (${PROFIL_FILE}) : ${e.message}\nForme attendue : ${JSON.stringify(PROFIL_EXEMPLE)}`);
  process.exit(1);
}
if (!Array.isArray(profil.octCaisse) || profil.octCaisse.length !== 31) { console.error("profil.octCaisse : 31 valeurs attendues (octobre)."); process.exit(1); }
const { ticketMean: TICKET_MEAN, platformMonthly, regulars: REGULARS, pool: POOL } = profil;
const PLATFORM_MEAN = platformMonthly / 30;                              // plateformes : HYPOTHÈSE de démo
const PLATFORM_SPLIT = { uber: 0.45, deliveroo: 0.30, takeaway: 0.25 }; // HYPOTHÈSE de démo
const OCT = new Map(profil.octCaisse.map((v, i) => [`2026-10-${String(i + 1).padStart(2, "0")}`, v]));
const OCT_TOTAL = profil.octCaisse.reduce((s, v) => s + v, 0);
const CA_TOTAL = OCT_TOTAL + platformMonthly;

// ── Hypothèses (tableau validé le 2026-11-03) ───────────────────────────────
// capture   : part des clients habituels captés par le programme
// lift      : hausse de fréquence de ces clients (paliers, équipes)
// conquest  : part de la zone qui devient cliente (nouveaux clients)
// visitsNew : visites par mois d'un nouveau client ; les habituels en font BASE_VISITS
// existing / conquest / steady / incOrders se calculent à partir du profil.
const BASE_VISITS = 2;
const SCENARIO_RATIOS = {
  faible:  { name: "Belchicken Kraainem — Hypothèse faible",  capture: 0.12, lift: 0.10, conquest: 0.010, visitsNew: 2.0, teamShare: 0.20, activeTeams: 2, seed: 20261103 },
  moyenne: { name: "Belchicken Kraainem — Hypothèse moyenne", capture: 0.30, lift: 0.20, conquest: 0.025, visitsNew: 2.3, teamShare: 0.40, activeTeams: 5, seed: 20261104 },
  forte:   { name: "Belchicken Kraainem — Hypothèse forte",   capture: 0.55, lift: 0.35, conquest: 0.050, visitsNew: 2.5, teamShare: 0.60, activeTeams: 9, seed: 20261105 },
};
const SCENARIOS = Object.fromEntries(Object.entries(SCENARIO_RATIOS).map(([k, r]) => {
  const existing = Math.round(REGULARS * r.capture), conquest = Math.round(POOL * r.conquest);
  const steady = Math.round(existing * BASE_VISITS + conquest * r.visitsNew);
  const incOrders = Math.round(existing * BASE_VISITS * r.lift + conquest * r.visitsNew);
  return [k, { ...r, existing, conquest, steady, incOrders }];
}));
const KEYS = ONLY ? [ONLY] : Object.keys(SCENARIOS);
if (KEYS.some((k) => !SCENARIOS[k])) { console.error(`--only inconnu : ${ONLY} (faible | moyenne | forte)`); process.exit(1); }

const LAUNCH = "2026-07-03";            // 1er ticket réel de Kraainem
const END = addDays(today, -1);          // le CA du jour se note le lendemain
const RAMP = { "2026-07": 0.10, "2026-08": 0.30, "2026-09": 0.60, "2026-10": 1, "2026-11": 1 };       // part du régime établi
const JOIN = { "2026-07": 0.10, "2026-08": 0.20, "2026-09": 0.30, "2026-10": 0.40, "2026-11": 0 };    // part des inscriptions
const HOLIDAY = ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]; // congé d'automne

// Facteurs de jour de semaine et du congé d'automne, tirés du réel d'octobre.
const normalDays = [...OCT.keys()].filter((d) => d <= "2026-10-25");
const normalMean = normalDays.reduce((s, d) => s + OCT.get(d), 0) / normalDays.length;
const WD_FACTOR = Array.from({ length: 7 }, (_, wd) => {
  const vs = normalDays.filter((d) => wdOf(d) === wd).map((d) => OCT.get(d));
  return vs.reduce((s, v) => s + v, 0) / vs.length / normalMean;
});
const holidayDays = [...OCT.keys()].filter((d) => HOLIDAY.includes(d));
const HOLIDAY_FACTOR = holidayDays.reduce((s, d) => s + OCT.get(d) / (WD_FACTOR[wdOf(d)] * normalMean), 0) / holidayDays.length;
const dayWeight = (d) => (d < LAUNCH ? 0 : WD_FACTOR[wdOf(d)] * (HOLIDAY.includes(d) ? HOLIDAY_FACTOR : 1));

const DAYS = [];
for (let d = LAUNCH; d <= END; d = addDays(d, 1)) DAYS.push(d);
const monthDays = (key) => { const out = []; for (let d = `${key}-01`; d.startsWith(key); d = addDays(d, 1)) out.push(d); return out; };
const monthWeight = Object.fromEntries(Object.keys(RAMP).map((k) => [k, monthDays(k).reduce((s, d) => s + dayWeight(d), 0)]));

// Équipes du périmètre (hautes écoles, université, hôpital, secondaires, quartier).
// Les noms sont génériques : à renommer en live si besoin.
const TEAM_DEFS = [
  { name: "Alma — étudiants",          type: "ecole",        emoji: "🎓", w: 3.0 },
  { name: "Saint-Luc — soignants",     type: "entreprise",   emoji: "🏥", w: 2.2 },
  { name: "Haute école 1",             type: "ecole",        emoji: "🎓", w: 2.2 },
  { name: "Haute école 2",             type: "ecole",        emoji: "🎓", w: 2.0 },
  { name: "Alma — personnel",          type: "entreprise",   emoji: "🏢", w: 1.2 },
  { name: "Saint-Luc — administratif", type: "entreprise",   emoji: "🏥", w: 1.0 },
  { name: "École secondaire 1",        type: "ecole",        emoji: "🎓", w: 1.0 },
  { name: "École secondaire 2",        type: "ecole",        emoji: "🎓", w: 1.0 },
  { name: "Quartier Kraainem",         type: "rue_quartier", emoji: "🏘️", w: 1.2 },
];
const FIRST = ["Yassine", "Emma", "Mehdi", "Louise", "Adam", "Lina", "Noah", "Sofia", "Rayan", "Julia", "Bilal", "Chloé", "Amine", "Nora", "Lucas", "Aya", "Hugo", "Sara", "Ilias", "Manon", "Omar", "Camille", "Karim", "Léa", "Nassim", "Inès", "Théo", "Salma", "Walid", "Eva"];
const MAIN_CATS = ["Chicken deals", "Burgers", "Menus burger", "Wraps", "Salades", "Chef's choice"];
const BUDGET_COST_PCT = 0.025; // coût des cadeaux / CA programme — HYPOTHÈSE de démo (plafond choisi : 4 %)

// ── Lecture de la source (Kraainem) — lecture seule ─────────────────────────
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
const { data: srcResto, error: srcErr } = await admin.from("restaurants").select("*").eq("id", SOURCE_ID).single();
if (srcErr) throw new Error(`source ${SOURCE_ID}: ${srcErr.message}`);
const srcMenu = await all("menu_items", "*", (q) => q.eq("restaurant_id", SOURCE_ID).eq("is_active", true));
const srcTiers = await all("reward_tiers", "*", (q) => q.eq("restaurant_id", SOURCE_ID));
const srcTeamTiers = await all("team_tiers", "*", (q) => q.eq("restaurant_id", SOURCE_ID));
const { data: srcCfg } = await admin.from("restaurant_receipt_config").select("*").eq("restaurant_id", SOURCE_ID).maybeSingle();
const srcMenuById = new Map(srcMenu.map((m) => [m.id, m]));
const menuPrice = (m) => Number(m.menu_price), menuCost = (m) => Number(m.cost_price);
const mains = srcMenu.filter((m) => MAIN_CATS.includes(m.category) && menuPrice(m) <= 14 && menuPrice(m) >= 5);
const drinks = srcMenu.filter((m) => m.category === "Boissons");
const sides = srcMenu.filter((m) => m.category === "Snacks & sides");
const desserts = srcMenu.filter((m) => m.category === "Desserts");
const buckets = srcMenu.filter((m) => m.category === "Buckets");
const soloTiers = srcTiers.filter((t) => t.layer === "solo" && t.is_active && srcMenuById.has(t.menu_item_id))
  .map((t) => ({ min: Number(t.min_threshold), item: srcMenuById.get(t.menu_item_id) })).sort((a, b) => a.min - b.min);
log(`Source ${SOURCE_ID} : ${srcMenu.length} articles actifs (${mains.length} plats de base), ${srcTiers.length} paliers (${soloTiers.length} solo), ${srcTeamTiers.length} paliers d'équipe, config ticket ${srcCfg ? "oui" : "non"}.`);

// ── Simulation d'une hypothèse (pur : rien n'est écrit ici) ─────────────────
function simulate(key) {
  const sc = SCENARIOS[key];
  const rand = makeRng(sc.seed);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const nM = sc.existing + sc.conquest;
  const incShare = sc.incOrders / sc.steady;

  // Équipes actives et adhésions
  const teams = TEAM_DEFS.slice(0, sc.activeTeams).map((t, i) => ({ ...t, key: i }));
  const teamW = teams.reduce((s, t) => s + t.w, 0);
  const pickTeam = () => { let r = rand() * teamW; for (const t of teams) { r -= t.w; if (r <= 0) return t.key; } return teams[0].key; };
  const members = [];
  for (let i = 0; i < nM; i++) {
    let r = rand(), month = "2026-10";
    for (const [k, share] of Object.entries(JOIN)) { r -= share; if (r <= 0) { month = k; break; } }
    const days = monthDays(month).filter((d) => d >= LAUNCH && d <= END);
    members.push({ i, joinDay: pick(days), teamKey: rand() < sc.teamShare ? pickTeam() : null, w: 0.4 + Math.pow(rand(), 2) * 3, orders: 0 });
  }
  members.sort((a, b) => (a.joinDay < b.joinDay ? -1 : a.joinDay > b.joinDay ? 1 : a.i - b.i));

  // Panier : un plat de base, souvent une boisson, parfois accompagnement / dessert
  const ticket = (isTeam) => {
    const lines = [{ item: pick(mains), qty: 1 }];
    if (rand() < 0.45) lines.push({ item: pick(drinks), qty: 1 });
    if (rand() < 0.30) lines.push({ item: pick(sides), qty: 1 });
    if (rand() < 0.18) lines.push({ item: pick(desserts), qty: 1 });
    if (rand() < 0.10) lines.push({ item: pick(mains), qty: 1 });
    if (isTeam && rand() < 0.05) lines.push({ item: pick(buckets), qty: 1 });
    return lines;
  };
  const orderTime = () => {
    const r = rand(); const h = r < 0.60 ? 11 + Math.floor(rand() * 3) : r < 0.90 ? 18 + Math.floor(rand() * 3) : 15 + Math.floor(rand() * 3);
    return `${String(h).padStart(2, "0")}:${String(Math.floor(rand() * 60)).padStart(2, "0")}`;
  };

  // Commandes jour par jour, parmi les membres déjà inscrits (tirage pondéré)
  const orders = []; const cum = []; let joined = 0, mi = 0;
  const bag = [];
  for (const day of DAYS) {
    while (mi < members.length && members[mi].joinDay <= day) { const m = members[mi++]; bag.push(m); cum.push((cum.at(-1) ?? 0) + m.w); joined++; }
    if (!bag.length) continue;
    const month = day.slice(0, 7);
    const expected = sc.steady * RAMP[month] * dayWeight(day) / monthWeight[month];
    const n = Math.floor(expected) + (rand() < expected - Math.floor(expected) ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const x = rand() * cum.at(-1); let lo = 0, hi = cum.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] >= x) hi = mid; else lo = mid + 1; }
      const m = bag[lo]; m.orders++;
      const lines = ticket(m.teamKey !== null);
      const amount = round2(lines.reduce((s, l) => s + menuPrice(l.item) * l.qty, 0));
      orders.push({ member: m, day, time: orderTime(), amount, lines });
    }
  }
  // Chaque membre a au moins un ticket (sinon il ne serait pas « actif ») : il REPREND le ticket
  // d'un membre qui en a plusieurs, daté après son inscription — le volume mensuel reste exact.
  for (const m of members) if (m.orders === 0) {
    let moved = false;
    for (let t = 0; t < 60 && !moved; t++) {
      const o = orders[Math.floor(rand() * orders.length)];
      if (o.day >= m.joinDay && o.member.orders > 1) { o.member.orders--; o.member = m; m.orders++; moved = true; }
    }
    if (moved) continue;
    const days = DAYS.filter((d) => d >= m.joinDay); const day = pick(days.length ? days : [END]);
    const lines = ticket(m.teamKey !== null); m.orders++;
    orders.push({ member: m, day, time: orderTime(), amount: round2(lines.reduce((s, l) => s + menuPrice(l.item) * l.qty, 0)), lines });
  }
  orders.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.time < b.time ? -1 : 1));

  // Cadeau d'accueil (ADR 0061) : le premier ticket de chaque membre, premier palier solo.
  // Un seul « available » par membre (index unique) ; les plus anciens expirent ou sont récupérés.
  const rewards = [];
  const welcome = soloTiers[0];
  const seenFirst = new Set(); const recent = addDays(today, -2);
  orders.forEach((o, idx) => {
    if (!welcome || seenFirst.has(o.member.i)) return;
    seenFirst.add(o.member.i);
    const status = o.day >= recent ? "available" : rand() < 0.25 ? "redeemed" : "expired";
    rewards.push({ orderIdx: idx, member: o.member, day: o.day, item: welcome.item.name, cost: menuCost(welcome.item), status });
  });

  // Budget cadeaux par mois (taux choisi par le restaurateur, ADR 0068) : accueil + échanges au
  // catalogue, ces derniers non simulés → coût total en HYPOTHÈSE de démo (BUDGET_COST_PCT du CA programme).
  const budget = {};
  for (const o of orders) { const k = `${o.day.slice(0, 7)}-01`; budget[k] = (budget[k] ?? 0) + o.amount; }
  const rewardCost = {};
  for (const [k, rev] of Object.entries(budget)) rewardCost[k] = rev * BUDGET_COST_PCT;

  // CA du jour : caisse (profil réel d'octobre) + commandes additionnelles ; plateformes en hypothèse
  const ordersByDay = {};
  for (const o of orders) ordersByDay[o.day] = (ordersByDay[o.day] ?? 0) + 1;
  const daily = DAYS.map((day) => {
    const base = OCT.get(day) ?? normalMean * dayWeight(day);
    const incOrders = (ordersByDay[day] ?? 0) * incShare;
    const caisse = round2(base + incOrders * TICKET_MEAN);
    const carte = round2(caisse * 0.72), cash = round2(caisse - carte);
    const platTotal = PLATFORM_MEAN * (0.5 + 0.5 * dayWeight(day) / (HOLIDAY.includes(day) ? HOLIDAY_FACTOR : 1)) * (0.92 + rand() * 0.16);
    const uber = round2(platTotal * PLATFORM_SPLIT.uber), deliveroo = round2(platTotal * PLATFORM_SPLIT.deliveroo), takeaway = round2(platTotal * PLATFORM_SPLIT.takeaway);
    const amount = round2(carte + cash + uber + deliveroo + takeaway);
    return { day, amount, tickets: Math.round(caisse / TICKET_MEAN), carte, cash, uber, deliveroo, takeaway, caisse };
  });

  // Atterrissages (entonnoir, ADR 0037) : proportionnels aux inscriptions du jour
  const joinsByDay = {};
  for (const m of members) joinsByDay[m.joinDay] = (joinsByDay[m.joinDay] ?? 0) + 1;
  const landings = [];
  for (const day of DAYS) {
    const joins = joinsByDay[day] ?? 0;
    const anon = Math.round(2 + joins * 4 * (0.8 + rand() * 0.4));
    landings.push({ day, source: "qr_code", visitor: "anonyme", count: Math.round(anon * 0.35) });
    landings.push({ day, source: "direct", visitor: "anonyme", count: anon - Math.round(anon * 0.35) });
    landings.push({ day, source: "direct", visitor: "membre", count: Math.round((ordersByDay[day] ?? 0) * 0.3) });
  }

  return { key, sc, members, teams, orders, rewards, budget, rewardCost, daily, landings };
}

// ── Rapport à blanc ─────────────────────────────────────────────────────────
function report(sim) {
  const { sc, members, teams, orders, rewards, daily } = sim;
  const byMonth = {};
  for (const o of orders) { const k = o.day.slice(0, 7); (byMonth[k] ??= { n: 0, s: 0 }); byMonth[k].n++; byMonth[k].s += o.amount; }
  const octDays = daily.filter((d) => d.day.startsWith("2026-10"));
  const octTotal = octDays.reduce((s, d) => s + d.amount, 0), octCaisse = octDays.reduce((s, d) => s + d.caisse, 0);
  const avg = orders.reduce((s, o) => s + o.amount, 0) / orders.length;
  const teamCount = new Map(); for (const m of members) if (m.teamKey !== null) teamCount.set(m.teamKey, (teamCount.get(m.teamKey) ?? 0) + 1);
  log(`── ${sc.name} ──`);
  log(`   membres ${members.length} (${members.filter((m) => m.teamKey !== null).length} en équipe), équipes actives ${teams.length}`);
  log(`   équipes : ${teams.map((t) => `${t.name} ${teamCount.get(t.key) ?? 0}`).join(" · ")}`);
  log(`   commandes ${orders.length}, lignes ${orders.reduce((s, o) => s + o.lines.length, 0)}, ticket moyen ${round2(avg)} €`);
  log(`   par mois : ${Object.entries(byMonth).map(([k, v]) => `${k} ${v.n} cmd / ${Math.round(v.s)} €`).join(" · ")}`);
  log(`   cadeaux ${rewards.length} (disponibles ${rewards.filter((r) => r.status === "available").length}, récupérés ${rewards.filter((r) => r.status === "redeemed").length})`);
  log(`   CA du jour : ${daily.length} jours ; octobre = ${Math.round(octTotal)} € total (caisse ${Math.round(octCaisse)} €, réel sans programme : ${Math.round(OCT_TOTAL)} € caisse, ${Math.round(CA_TOTAL)} € avec plateformes)`);
  log(`   hypothèse : ${sc.existing} habituels captés + ${sc.conquest} conquis, ${sc.steady} cmd/mois à régime établi dont ${sc.incOrders} additionnelles`);
  log(`   atterrissages ${sim.landings.reduce((s, l) => s + l.count, 0)}`);
}

const sims = KEYS.map(simulate);
log(`Facteurs jour de semaine (lun→dim) : ${WD_FACTOR.map((f) => f.toFixed(2)).join(" ")} ; congé d'automne ×${HOLIDAY_FACTOR.toFixed(2)} ; période ${LAUNCH} → ${END} (${DAYS.length} jours)`);
for (const s of sims) report(s);

// État actuel en base (lecture seule) : conflits éventuels
const { data: existing } = await admin.from("restaurants").select("id").like("id", `${PREFIX}%`);
const clash = KEYS.filter((k) => (existing ?? []).some((r) => r.id === `${PREFIX}${k}`));
if (clash.length) log(`⚠️  Démos déjà présentes : ${clash.join(", ")} — lancer scripts/seed-demo-kraainem-clean.mjs avant d'écrire.`);

if (!APPLY) {
  log("");
  log("À BLANC : rien n'a été écrit. Relancer avec --apply (après accord) pour écrire dans la base.");
  process.exit(0);
}
if (clash.length) { console.error("Refus d'écrire : démos déjà présentes."); process.exit(1); }

// ── Écriture ────────────────────────────────────────────────────────────────
async function insertBatch(table, rows, select, size = 500) {
  const out = [];
  for (let i = 0; i < rows.length; i += size) {
    const q = admin.from(table).insert(rows.slice(i, i + size));
    const { data, error } = select ? await q.select(select) : await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    if (data) out.push(...data);
  }
  return out;
}
const must = async (p, label) => { const { error } = await p; if (error) throw new Error(`${label}: ${error.message}`); };

// Comptes : un gérant de démo + un pool partagé (une adhésion par établissement suffit
// à réutiliser le même compte dans les trois démos).
const needed = Math.max(...sims.map((s) => s.members.length));
const known = new Map();
for (let page = 1; page <= 100; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw new Error(error.message);
  for (const u of data.users) if ((u.email ?? "").endsWith(DOMAIN)) known.set(u.email, u.id);
  if (data.users.length < 200) break;
}
const ownerEmail = `owner${DOMAIN}`;
if (!known.has(ownerEmail)) {
  const { data, error } = await admin.auth.admin.createUser({ email: ownerEmail, password: PW, email_confirm: true, user_metadata: { display_name: "Gérant démo Kraainem", zones: ["Kraainem"] } });
  if (error) throw new Error(`owner: ${error.message}`);
  known.set(ownerEmail, data.user.id);
}
const ownerId = known.get(ownerEmail);
const userIds = [];
for (let i = 0; i < needed; i += 10) {
  const batch = await Promise.all(Array.from({ length: Math.min(10, needed - i) }, async (_, j) => {
    const n = i + j, email = `demo-user-${n}${DOMAIN}`;
    if (known.has(email)) return known.get(email);
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { display_name: `${FIRST[n % FIRST.length]} ${String.fromCharCode(65 + (n % 26))}.`, zones: ["Kraainem"] } });
    if (error) throw new Error(`createUser ${email}: ${error.message}`);
    return data.user.id;
  }));
  userIds.push(...batch);
  if ((i + 10) % 200 === 0) log(`  comptes ${i + 10}/${needed}`);
}
log(`${userIds.length} comptes de démo prêts (+ gérant).`);

for (const sim of sims) {
  const { key, sc, members, teams, orders, rewards, budget, rewardCost, daily, landings } = sim;
  const rid = `${PREFIX}${key}`;
  log(`── écriture ${rid} ──`);

  await insertBatch("restaurants", [{
    id: rid, name: sc.name, status: "active", is_demo: true, activated_at: new Date().toISOString(), owner_id: ownerId,
    sector: srcResto.sector, address: srcResto.address, cuisine_types: srcResto.cuisine_types, school_calendar: srcResto.school_calendar,
    lat: srcResto.lat, lng: srcResto.lng, closing_times: srcResto.closing_times,
    logo_url: srcResto.logo_url, hero_image_url: srcResto.hero_image_url, brand_primary: srcResto.brand_primary, brand_dark: srcResto.brand_dark,
    brand_accent: srcResto.brand_accent, brand_font: srcResto.brand_font, website_url: srcResto.website_url,
  }]);
  await must(admin.from("restaurant_subscriptions").upsert({ restaurant_id: rid, plan: "pro", status: "active", plan_activated_at: new Date(Date.now() - 30 * 86_400_000).toISOString(), updated_at: new Date().toISOString() }, { onConflict: "restaurant_id" }), "abonnement");

  // Catalogue, config ticket et paliers : clonés de Kraainem (ids remappés par nom)
  const newMenu = await insertBatch("menu_items", srcMenu.map(({ id, created_at, updated_at, ...m }) => ({ ...m, restaurant_id: rid })), "id, name");
  const idByName = new Map(newMenu.map((m) => [m.name, m.id]));
  const mapItem = (oldId) => { const m = srcMenuById.get(oldId); return m ? idByName.get(m.name) ?? null : null; };
  if (srcCfg) { const { id, ...cfg } = srcCfg; await insertBatch("restaurant_receipt_config", [{ ...cfg, restaurant_id: rid, confirmed_by: ownerId }]); }
  await insertBatch("reward_tiers", srcTiers.map(({ id, created_at, updated_at, ...t }) => ({ ...t, restaurant_id: rid, menu_item_id: t.menu_item_id ? mapItem(t.menu_item_id) : null })));
  if (srcTeamTiers.length) await insertBatch("team_tiers", srcTeamTiers.map(({ id, created_at, updated_at, ...t }) => ({ ...t, restaurant_id: rid, menu_item_id: t.menu_item_id ? mapItem(t.menu_item_id) : null })));

  // Seuil CA (ADR 0012) : débloqué seulement si l'hypothèse dépasse la croissance cible de 10 %
  const baselineWeekly = round2(OCT_TOTAL / 31 * 7), unlocked = sc.incOrders * TICKET_MEAN / CA_TOTAL >= 0.10;
  await insertBatch("restaurant_thresholds", [{ restaurant_id: rid, period_label: "Mois en cours", target_revenue: round2(baselineWeekly * 1.1), current_revenue: unlocked ? round2(baselineWeekly * 1.15) : round2(baselineWeekly * 1.04), is_unlocked: unlocked, unlocked_at: unlocked ? new Date().toISOString() : null, baseline_weekly_revenue: baselineWeekly, growth_target_pct: 0.10 }]);

  // Équipes (+ ligne de score à zéro), adhésions, commandes : les triggers font le reste
  const createdTeams = await insertBatch("teams", teams.map((t, i) => ({ name: t.name, restaurant_id: rid, type: t.type, created_by: userIds[0], flag_emoji: t.emoji, is_active: true, zone: "Kraainem", join_code: `DK${key[0].toUpperCase()}${String(i).padStart(2, "0")}${rid.length}` })), "id, name");
  const teamId = new Map(teams.map((t, i) => [t.key, createdTeams[i].id]));
  await insertBatch("community_scores", createdTeams.map((t) => ({ team_id: t.id, restaurant_id: rid, member_count: 0, total_spent: 0, score: 0 })));
  await insertBatch("memberships", members.map((m) => ({ user_id: userIds[m.i], restaurant_id: rid, team_id: m.teamKey !== null ? teamId.get(m.teamKey) : null, joined_at: `${m.joinDay}T10:00:00Z` })));
  log(`  ${teams.length} équipes, ${members.length} adhésions`);

  let seq = 0;
  const orderIds = [];
  const orderRows = orders.map((o) => ({ user_id: userIds[o.member.i], team_id: o.member.teamKey !== null ? teamId.get(o.member.teamKey) : null, restaurant_id: rid, amount: o.amount, order_date: o.day, order_time: o.time, duplicate_key: `${rid}:DK_${seq++}`, status: "validated", validated_at: `${o.day}T${o.time}:00Z`, flag_reasons: [], submitted_at: `${o.day}T${o.time}:00Z` }));
  for (let i = 0; i < orderRows.length; i += 250) {
    const ins = await insertBatch("orders", orderRows.slice(i, i + 250), "id", 250);
    orderIds.push(...ins.map((r) => r.id));
    if ((i / 250) % 10 === 0) log(`  commandes ${Math.min(i + 250, orderRows.length)}/${orderRows.length}`);
  }
  const itemRows = [];
  orders.forEach((o, idx) => o.lines.forEach((l, li) => itemRows.push({ order_id: orderIds[idx], line_index: li, raw_name: l.item.name, quantity: l.qty, unit_price: l.item.menu_price, menu_item_id: idByName.get(l.item.name) ?? null })));
  await insertBatch("order_items", itemRows);
  log(`  ${orderRows.length} commandes, ${itemRows.length} lignes`);

  await insertBatch("pending_rewards", rewards.map((r) => ({ user_id: userIds[r.member.i], order_id: orderIds[r.orderIdx], restaurant_id: rid, solo_item: r.item, solo_cost: r.cost, status: r.status, source: "order", created_at: `${r.day}T12:00:00Z`, redeemed_at: r.status === "redeemed" ? `${addDays(r.day, 1)}T12:00:00Z` : null })));
  await insertBatch("reward_budget_tracking", Object.entries(budget).map(([period_month, rev]) => ({ restaurant_id: rid, period_month, program_revenue: round2(rev), rewards_cost: round2(rewardCost[period_month] ?? 0), budget_pct: 0.04, community_bonus_active: unlocked })));
  await insertBatch("qr_landings", landings.filter((l) => l.count > 0).map((l) => ({ restaurant_id: rid, ...l })));
  log(`  ${rewards.length} cadeaux, ${Object.keys(budget).length} mois de budget, ${landings.length} lignes d'atterrissage`);

  for (let i = 0; i < daily.length; i += 10) {
    await Promise.all(daily.slice(i, i + 10).map((d) => must(admin.rpc("save_daily_revenue_console", { p_restaurant_id: rid, p_day: d.day, p_closed: false, p_amount: d.amount, p_tickets: d.tickets, p_carte: d.carte, p_cash: d.cash, p_internet: 0, p_uber: d.uber, p_deliveroo: d.deliveroo, p_takeaway: d.takeaway, p_entered_by: ownerId }), `CA ${d.day}`)));
  }
  log(`  ${daily.length} jours de CA saisis`);

  // Vérification : ce que les triggers ont calculé
  const { data: scores } = await admin.from("community_scores").select("member_count, total_spent").eq("restaurant_id", rid);
  const { count: nOrders } = await admin.from("orders").select("id", { count: "exact", head: true }).eq("restaurant_id", rid);
  log(`  ✓ ${nOrders} commandes en base ; équipes : ${(scores ?? []).reduce((s, x) => s + x.member_count, 0)} membres, ${Math.round((scores ?? []).reduce((s, x) => s + Number(x.total_spent), 0))} € dépensés (calculés par les triggers)`);
}
log("");
log(`✅ DÉMOS ÉCRITES : ${sims.map((s) => `${PREFIX}${s.key}`).join(", ")} — ouvrir /admin/<id> en mode plateforme ; gérant : owner${DOMAIN}`);
