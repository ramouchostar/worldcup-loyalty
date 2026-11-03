// ============================================================================
// DÉMONTAGE des démos Kraainem : supprime TOUT ce qui est préfixé
// "demo-kraainem-" (restos + données rattachées) et TOUS les comptes
// "@demo-kraainem.boosteats.test". Ne touche à rien d'autre (kraainem et
// comptes réels intacts, comme les zz-test-* du seed d'audit).
//
// SÛR PAR DÉFAUT : sans `--apply`, compte seulement ce qui serait supprimé.
//   node scripts/seed-demo-kraainem-clean.mjs
//   node scripts/seed-demo-kraainem-clean.mjs --apply
// ============================================================================
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const APPLY = process.argv.includes("--apply");
const ENV_FILE = process.env.ENV_FILE || ".env.local";
const env = Object.fromEntries(
  readFileSync(ENV_FILE, "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
if (typeof globalThis.WebSocket === "undefined") { globalThis.WebSocket = class { constructor() {} close() {} }; }
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const PREFIX = "demo-kraainem-";
const DOMAIN = "@demo-kraainem.boosteats.test";

// Tables portant restaurant_id, dans l'ordre enfants → parents.
// (order_items cascade depuis orders ; le reste cascade depuis restaurants.)
const TABLES = [
  "redemption_tokens", "point_transactions", "pending_rewards",
  "orders",
  "community_scores", "memberships", "teams",
  "team_tiers", "reward_tiers", "restaurant_thresholds", "reward_budget_tracking",
  "restaurant_receipt_config", "restaurant_subscriptions", "feature_trials",
  "daily_revenue_entries", "restaurant_sales", "sales_imports", "qr_landings",
  "menu_items",
];

for (const table of TABLES) {
  const { count, error } = await admin.from(table).select("restaurant_id", { count: "exact", head: true }).like("restaurant_id", `${PREFIX}%`);
  if (error) { log(`  ${table}: ⚠️ ${error.message}`); continue; }
  if (!APPLY) { log(`  ${table}: ${count} lignes`); continue; }
  const del = await admin.from(table).delete().like("restaurant_id", `${PREFIX}%`);
  log(del.error ? `  ${table}: ⚠️ ${del.error.message}` : `  ${table} nettoyé (${count})`);
}
if (APPLY) {
  const { error } = await admin.from("restaurants").delete().like("id", `${PREFIX}%`);
  log(error ? `restaurants: ⚠️ ${error.message}` : "restaurants supprimés");
} else {
  const { count } = await admin.from("restaurants").select("id", { count: "exact", head: true }).like("id", `${PREFIX}%`);
  log(`restaurants : ${count}`);
}

// Comptes de démo — re-lister depuis la page 1 à chaque tour (supprimer pendant
// qu'on pagine fait glisser l'index et laisse des comptes derrière).
let found = 0;
for (let pass = 0; pass < 100; pass++) {
  const targets = [];
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    targets.push(...data.users.filter((u) => (u.email ?? "").endsWith(DOMAIN)));
    if (data.users.length < 200) break;
  }
  if (!APPLY) { found = targets.length; break; }
  if (targets.length === 0) break;
  for (const u of targets) { await admin.auth.admin.deleteUser(u.id); found++; }
}
log(`${found} comptes ${DOMAIN} ${APPLY ? "supprimés" : "à supprimer"}.`);

if (!APPLY) { log(""); log("À BLANC : rien n'a été supprimé. Relancer avec --apply."); process.exit(0); }
const { count: restoLeft } = await admin.from("restaurants").select("id", { count: "exact", head: true }).like("id", `${PREFIX}%`);
log("");
log(`✅ DÉMONTAGE TERMINÉ — démos restantes : ${restoLeft ?? "?"}`);
