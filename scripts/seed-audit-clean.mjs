// ============================================================================
// DÉMONTAGE du seed d'audit : supprime TOUT ce qui est préfixé "zz-test-"
// (restos + données rattachées) et TOUS les comptes "@seed.boosteats.test".
// Ne touche à rien d'autre (kraainem et comptes réels intacts).
// Ordre : enfants → parents ; restaurants (cascade le reste) ; puis auth.users.
// ============================================================================
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
if (typeof globalThis.WebSocket === "undefined") { globalThis.WebSocket = class { constructor() {} close() {} }; }
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const PREFIX = "zz-test-";
const DOMAIN = "@seed.boosteats.test";

// Tables portant restaurant_id, dans l'ordre enfants → parents.
// (order_items casca­de depuis orders ; feedback_messages depuis quality_feedback.)
const TABLES = [
  "redemption_tokens", "point_transactions", "pending_rewards",
  "feedback_messages", "quality_feedback",
  "orders",
  "referrals", "referral_links", "micro_reward_claims",
  "community_scores", "memberships", "teams",
  "reward_tiers", "restaurant_thresholds", "reward_budget_tracking",
  "restaurant_receipt_config", "restaurant_subscriptions", "feature_trials",
  "restaurant_sales", "sales_imports", "restaurant_events",
  "micro_rewards", "menu_items",
];

for (const table of TABLES) {
  const { error } = await admin.from(table).delete().like("restaurant_id", `${PREFIX}%`);
  log(error ? `  ${table}: ⚠️ ${error.message}` : `  ${table} nettoyé`);
}
{
  const { error } = await admin.from("restaurants").delete().like("id", `${PREFIX}%`);
  log(error ? `restaurants: ⚠️ ${error.message}` : "restaurants supprimés");
}

// Comptes de test — re-lister depuis la page 1 à chaque tour (supprimer pendant
// qu'on pagine fait glisser l'index et laisse des comptes derrière).
let deleted = 0;
for (let pass = 0; pass < 100; pass++) {
  const targets = [];
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    targets.push(...data.users.filter((u) => (u.email ?? "").endsWith(DOMAIN)));
    if (data.users.length < 200) break;
  }
  if (targets.length === 0) break;
  for (const u of targets) { await admin.auth.admin.deleteUser(u.id); deleted++; }
}
log(`${deleted} comptes ${DOMAIN} supprimés.`);

// Vérification : plus aucune trace namespacée.
const { count: restoLeft } = await admin.from("restaurants").select("id", { count: "exact", head: true }).like("id", `${PREFIX}%`);
const { data: usersLeft } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
const seedLeft = (usersLeft?.users ?? []).filter((u) => (u.email ?? "").endsWith(DOMAIN)).length;
log("");
log(`✅ DÉMONTAGE TERMINÉ — restos zz-test restants : ${restoLeft ?? "?"} | comptes seed restants : ${seedLeft}`);
if ((restoLeft ?? 0) === 0 && seedLeft === 0) log("   Prod remise à son état réel.");
else log("   ⚠️ Restes détectés — relancer ou inspecter.");
