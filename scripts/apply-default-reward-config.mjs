// One-shot ops — applique la grille par défaut ADR 0017 §4 aux établissements
// existants qui ont un catalogue mais pas encore de configuration (les
// nouveaux uploads passent désormais par lib/reward-defaults.ts ; ce script
// couvre les restos qui ne re-téléverseront pas leur CSV).
// Mêmes règles que lib/reward-defaults.ts : déterministe, non-destructif
// (une couche configurée ou un cadeau jetons déjà choisi ne sont jamais touchés).
//
// Usage : node scripts/apply-default-reward-config.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class {
    constructor() {}
    close() {}
  };
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Répliques des fonctions pures de lib/reward-sizing.ts ───────────────────
const BUDGET_PCT = parseFloat(env.REWARD_BUDGET_PCT ?? "0.08");
const DEFAULT_AVG_BASKET = 25;
const COMMUNITY_BANDS = [1000, 3000, 6000, 10000];
const SOLO_MULTIPLIERS = [1, 5 / 3, 8 / 3, 4];
const roundTo5 = (n) => Math.max(5, Math.round(n / 5) * 5);
const soloCostCap = (threshold) => threshold * BUDGET_PCT;
const jetonsGiftCostCap = (avgBasket) => (avgBasket > 0 ? avgBasket : DEFAULT_AVG_BASKET) * BUDGET_PCT;

function suggestSoloBands(avgBasket, cheapestCost) {
  const safeBasket = avgBasket > 0 ? avgBasket : DEFAULT_AVG_BASKET;
  const minForCheapest = cheapestCost > 0 ? cheapestCost / BUDGET_PCT : 0;
  const base = roundTo5(Math.max(0.85 * safeBasket, minForCheapest));
  const bands = SOLO_MULTIPLIERS.map((m) => roundTo5(base * m));
  return bands.filter((b, i) => i === 0 || b > bands[i - 1]);
}

function pickBestGift(items, costCap) {
  let best = null;
  let bestRatio = -1;
  for (const it of items) {
    if (it.cost_price <= 0 || it.cost_price > costCap) continue;
    const ratio = it.menu_price / it.cost_price;
    if (ratio > bestRatio || (ratio === bestRatio && best && it.cost_price < best.cost_price)) {
      best = it;
      bestRatio = ratio;
    }
  }
  return best;
}

function pickGenerousGift(items, costCap) {
  let best = null;
  for (const it of items) {
    if (it.cost_price <= 0 || it.cost_price > costCap) continue;
    if (!best || it.menu_price > best.menu_price || (it.menu_price === best.menu_price && it.cost_price < best.cost_price)) {
      best = it;
    }
  }
  return best;
}

// ─── Application par établissement ────────────────────────────────────────────
async function applyFor(restaurantId) {
  const { data: itemsRaw } = await admin
    .from("menu_items")
    .select("id, name, menu_price, cost_price")
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true)
    .eq("reward_eligible", true);
  const items = (itemsRaw ?? []).map((i) => ({
    ...i,
    menu_price: Number(i.menu_price),
    cost_price: Number(i.cost_price),
  }));
  if (items.length === 0) return "pas de catalogue — ignoré";

  const { data: orders } = await admin
    .from("orders")
    .select("amount")
    .eq("restaurant_id", restaurantId)
    .eq("status", "validated")
    .order("submitted_at", { ascending: false })
    .limit(1000);
  const avgBasket =
    orders && orders.length > 0
      ? orders.reduce((s, o) => s + Number(o.amount), 0) / orders.length
      : DEFAULT_AVG_BASKET;

  const costs = items.map((i) => i.cost_price).filter((c) => c > 0);
  const cheapest = costs.length > 0 ? Math.min(...costs) : 0;
  const soloBands = suggestSoloBands(avgBasket, cheapest);

  const { data: existing } = await admin
    .from("reward_tiers")
    .select("layer")
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true);
  const configured = new Set((existing ?? []).map((r) => r.layer));

  const giftForBand = (cap, isFirst) => (isFirst ? pickBestGift(items, cap) : pickGenerousGift(items, cap));
  const rows = [];
  const report = [];

  if (!configured.has("solo")) {
    soloBands.forEach((band, i) => {
      const gift = giftForBand(soloCostCap(band), i === 0);
      rows.push({ restaurant_id: restaurantId, layer: "solo", min_threshold: band, menu_item_id: gift?.id ?? null, is_active: true });
      report.push(`solo €${band} → ${gift?.name ?? "—"}`);
    });
  } else report.push("solo déjà configuré");

  if (!configured.has("community")) {
    COMMUNITY_BANDS.forEach((score, i) => {
      const capBand = soloBands[Math.min(i, soloBands.length - 1)];
      const gift = giftForBand(soloCostCap(capBand), i === 0);
      rows.push({ restaurant_id: restaurantId, layer: "community", min_threshold: score, menu_item_id: gift?.id ?? null, is_active: true });
      report.push(`community ${score} pts → ${gift?.name ?? "—"}`);
    });
  } else report.push("community déjà configuré");

  if (rows.length > 0) {
    const { error } = await admin.from("reward_tiers").upsert(rows, { onConflict: "restaurant_id,layer,min_threshold" });
    if (error) return `ERREUR reward_tiers : ${error.message}`;
  }

  const { data: resto } = await admin
    .from("restaurants")
    .select("jetons_gift_menu_item_id")
    .eq("id", restaurantId)
    .maybeSingle();
  if (resto && !resto.jetons_gift_menu_item_id) {
    const gift = pickBestGift(items, jetonsGiftCostCap(avgBasket));
    if (gift) {
      const { error } = await admin.from("restaurants").update({ jetons_gift_menu_item_id: gift.id }).eq("id", restaurantId);
      report.push(error ? `ERREUR jetons : ${error.message}` : `jetons → ${gift.name}`);
    } else report.push("jetons : aucun article sous plafond");
  } else report.push("jetons déjà configuré");

  return `panier ~€${avgBasket.toFixed(0)} | ${report.join(" ; ")}`;
}

const { data: restos } = await admin.from("restaurants").select("id, name");
for (const r of restos ?? []) {
  const outcome = await applyFor(r.id);
  console.log(`[${r.id}] ${outcome}`);
}
console.log("Terminé.");
