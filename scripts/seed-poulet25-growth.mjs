// Seed de démo — croissance ciblée pour zz-test-poulet-25 ("Poulet Jette 25").
// Objectif : ajouter des membres réels aux 3 équipes existantes et faire
// dépasser le CA validé de la semaine en cours au seuil de croissance
// (ADR 0012 garde-fou 2 — restaurant_thresholds.baseline_weekly_revenue ×
// (1 + growth_target_pct)) pour débloquer le bonus communautaire en démo.
// DML uniquement, idempotent par plage d'index dédiée (seed-user-1000+,
// duplicate_key GRW-*) pour ne jamais entrer en collision avec les ~510
// comptes seed déjà présents sur les autres restaurants zz-test-*.
//
// Usage : node scripts/seed-poulet25-growth.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import crypto from "node:crypto";

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

const RESTAURANT_ID = "zz-test-poulet-25";
const START_INDEX = 1000; // au-dessus du max existant (509) — pas de collision

const FIRST_NAMES = [
  "Yassine", "Emma", "Mehdi", "Louise", "Adam", "Lina", "Noah", "Sofia", "Rayan", "Julia",
  "Bilal", "Chloé", "Amine", "Nora", "Lucas", "Aya", "Hugo", "Sara", "Ilias", "Manon",
  "Omar", "Camille", "Karim", "Léa", "Nassim", "Inès", "Théo", "Salma", "Walid", "Eva",
  "Driss", "Zoé", "Sami", "Alice", "Hamza", "Nina", "Imane", "Yanis", "Nadia", "Rania",
];
const LAST_INITIALS = ["A", "B", "C", "D", "E", "F", "G", "H", "K", "L", "M", "N", "R", "S", "T", "V", "W", "Y", "Z"];

// Répartition des 130 nouveaux membres sur les 3 équipes existantes
const TEAMS = [
  { name: "Les Réguliers 1", newMembers: 55 },
  { name: "Les Gourmands 2", newMembers: 35 },
  { name: "Les Gourmands 3", newMembers: 40 },
];

const ORDERS_THIS_WEEK = 65; // sur les 130 nouveaux membres, ceux qui commandent cette semaine
const ORDER_AMOUNT_MIN = 9;
const ORDER_AMOUNT_MAX = 32;

function nextDisplayName(idx) {
  const first = FIRST_NAMES[idx % FIRST_NAMES.length];
  const initial = LAST_INITIALS[idx % LAST_INITIALS.length];
  return `${first} ${initial}.`;
}

async function ensureUser(email, displayName) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: crypto.randomUUID(),
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (!error) return data.user.id;

  const { data: existing } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (existing) return existing.id;
  throw new Error(`createUser(${email}): ${error.message}`);
}

// Lundi 00:00 UTC de la semaine en cours + un jour aléatoire jusqu'à aujourd'hui
function randomDateThisWeek() {
  const now = new Date();
  const daysSinceMonday = (now.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday));
  const offsetDays = Math.floor(Math.random() * (daysSinceMonday + 1));
  const day = new Date(monday);
  day.setUTCDate(monday.getUTCDate() + offsetDays);
  day.setUTCHours(10 + Math.floor(Math.random() * 11), Math.floor(Math.random() * 60), 0, 0);
  if (day.getTime() > now.getTime()) return now;
  return day;
}

function randomAmount() {
  const v = ORDER_AMOUNT_MIN + Math.random() * (ORDER_AMOUNT_MAX - ORDER_AMOUNT_MIN);
  return Math.round(v * 100) / 100;
}

async function main() {
  const { data: teamsRows, error: teamsErr } = await admin
    .from("teams")
    .select("id, name")
    .eq("restaurant_id", RESTAURANT_ID);
  if (teamsErr) throw new Error(`teams: ${teamsErr.message}`);

  let globalIdx = START_INDEX;
  const orderableMembers = []; // { userId, teamId }

  for (const teamPlan of TEAMS) {
    const team = teamsRows.find((t) => t.name === teamPlan.name);
    if (!team) {
      console.warn(`⚠ Équipe "${teamPlan.name}" introuvable sur ${RESTAURANT_ID} — ignorée`);
      continue;
    }

    let joined = 0;
    for (let i = 0; i < teamPlan.newMembers; i++) {
      const idx = globalIdx++;
      const email = `seed-user-${idx}@seed.boosteats.test`;
      const displayName = nextDisplayName(idx);
      const userId = await ensureUser(email, displayName);

      const { error: memErr } = await admin
        .from("memberships")
        .insert({ user_id: userId, restaurant_id: RESTAURANT_ID, team_id: team.id });
      if (!memErr) joined++;
      else if (!memErr.message.includes("duplicate")) console.warn(`  ⚠ membership ${email}: ${memErr.message}`);

      orderableMembers.push({ userId, teamId: team.id });
    }
    console.log(`👥 ${team.name} — ${joined} nouveau(x) membre(s) / ${teamPlan.newMembers}`);
  }

  // Commandes de la semaine en cours pour une partie des nouveaux membres
  const shuffled = [...orderableMembers].sort(() => Math.random() - 0.5);
  const orderers = shuffled.slice(0, Math.min(ORDERS_THIS_WEEK, shuffled.length));

  let weekTotal = 0;
  let created = 0;
  for (const member of orderers) {
    const amount = randomAmount();
    const when = randomDateThisWeek();
    const duplicateKey = `${RESTAURANT_ID}:GRW-${crypto.randomBytes(4).toString("hex")}`;

    const { error } = await admin.from("orders").insert({
      user_id: member.userId,
      team_id: member.teamId,
      restaurant_id: RESTAURANT_ID,
      amount,
      order_date: when.toISOString().slice(0, 10),
      submitted_at: when.toISOString(),
      validated_at: when.toISOString(),
      status: "validated",
      duplicate_key: duplicateKey,
    });
    if (error) {
      console.warn(`  ⚠ order ${duplicateKey}: ${error.message}`);
      continue;
    }
    weekTotal += amount;
    created++;
  }

  console.log(`🧾 ${created} commande(s) validée(s) créées cette semaine, +€${weekTotal.toFixed(2)}`);

  const { data: threshold } = await admin
    .from("restaurant_thresholds")
    .select("baseline_weekly_revenue, growth_target_pct")
    .eq("restaurant_id", RESTAURANT_ID)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const target = Number(threshold?.baseline_weekly_revenue ?? 0) * (1 + Number(threshold?.growth_target_pct ?? 0.1));
  console.log(`🎯 Cible de croissance hebdo : €${target.toFixed(2)}`);
  console.log("✅ Seed terminé");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
