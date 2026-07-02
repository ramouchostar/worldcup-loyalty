// Seed de démo — phase de test (session 2026-07-02).
// Donne un secteur + des équipes + des membres factices aux 3 restaurants de
// test pour prévisualiser le rendu de /secteurs et des leaderboards comme si
// l'app était lancée. DML uniquement (la clé service_role ne permet pas de
// DDL) — réutilisable : ré-exécution idempotente (emails déterministes,
// équipes retrouvées par nom).
//
// Usage : node scripts/seed-demo-sectors.mjs
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

// Node 20 n'a pas de WebSocket natif et supabase-js instancie son client
// realtime même sans abonnement — stub suffisant, on ne fait que du REST.
if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class {
    constructor() {}
    close() {}
  };
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TYPE_EMOJI = { ecole: "🎓", entreprise: "🏢", rue_quartier: "🏘️", taxis: "🚕", autre: "👥" };

const FIRST_NAMES = [
  "Yassine", "Emma", "Mehdi", "Louise", "Adam", "Lina", "Noah", "Sofia", "Rayan", "Julia",
  "Bilal", "Chloé", "Amine", "Nora", "Lucas", "Aya", "Hugo", "Sara", "Ilias", "Manon",
  "Omar", "Camille", "Karim", "Léa", "Nassim", "Inès", "Théo", "Salma", "Walid", "Eva",
  "Driss", "Zoé", "Sami", "Alice", "Hamza", "Nina",
];
const LAST_INITIALS = ["A", "B", "C", "D", "E", "F", "G", "H", "K", "L", "M", "N", "R", "S", "T", "V", "Z"];

const PLAN = [
  {
    match: "Tacos Loco",
    sector: "Molenbeek",
    teams: [
      { name: "Institut de la Sagesse", type: "ecole", members: 8, totalSpent: 720 },
      { name: "Rue de Ribaucourt", type: "rue_quartier", members: 6, totalSpent: 445 },
      { name: "Taxis Gare de l'Ouest", type: "taxis", members: 4, totalSpent: 310 },
    ],
  },
  {
    match: "Pizza Napoli",
    sector: "Schaerbeek",
    teams: [
      { name: "Collège Helmet", type: "ecole", members: 7, totalSpent: 530 },
      { name: "Quartier Terdelt", type: "rue_quartier", members: 4, totalSpent: 260 },
    ],
  },
  {
    match: "Sushi Zen",
    sector: "Ixelles — Flagey",
    teams: [
      { name: "Agence Flagey Digital", type: "entreprise", members: 4, totalSpent: 380 },
      { name: "Rue des Étangs", type: "rue_quartier", members: 3, totalSpent: 190 },
    ],
  },
];

function randomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.randomBytes(6), (b) => chars[b % chars.length]).join("");
}

let nameIdx = 0;
function nextDisplayName() {
  const first = FIRST_NAMES[nameIdx % FIRST_NAMES.length];
  const initial = LAST_INITIALS[nameIdx % LAST_INITIALS.length];
  nameIdx++;
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

  // Déjà créé (ré-exécution) — retrouve l'id via profiles.email
  const { data: existing } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
  if (existing) return existing.id;
  throw new Error(`createUser(${email}): ${error.message}`);
}

async function main() {
  for (const resto of PLAN) {
    const { data: r } = await admin
      .from("restaurants")
      .select("id, name")
      .ilike("name", `%${resto.match}%`)
      .maybeSingle();
    if (!r) {
      console.warn(`⚠ Restaurant "${resto.match}" introuvable — ignoré`);
      continue;
    }

    await admin.from("restaurants").update({ sector: resto.sector }).eq("id", r.id);
    console.log(`📍 ${r.name} → secteur "${resto.sector}"`);

    let memberSeq = 0;
    for (const team of resto.teams) {
      // Membres d'abord — le créateur de l'équipe est son premier membre
      const userIds = [];
      for (let i = 0; i < team.members; i++) {
        memberSeq++;
        const email = `demo-${r.id}-${String(memberSeq).padStart(2, "0")}@seed.local`;
        userIds.push(await ensureUser(email, nextDisplayName()));
      }

      // Équipe (retrouvée par nom si ré-exécution)
      let { data: t } = await admin
        .from("teams")
        .select("id")
        .eq("restaurant_id", r.id)
        .eq("name", team.name)
        .maybeSingle();
      if (!t) {
        const { data: created, error } = await admin
          .from("teams")
          .insert({
            name: team.name,
            type: team.type,
            restaurant_id: r.id,
            created_by: userIds[0],
            join_code: randomCode(),
            flag_emoji: TYPE_EMOJI[team.type],
            is_active: true,
          })
          .select("id")
          .single();
        if (error) throw new Error(`teams.insert(${team.name}): ${error.message}`);
        t = created;
      }

      // Score communautaire — total_spent posé ici, member_count incrémenté
      // par le trigger on_membership_team_change à chaque membership insérée
      await admin.from("community_scores").upsert(
        { team_id: t.id, restaurant_id: r.id, total_spent: team.totalSpent },
        { onConflict: "team_id" }
      );

      let joined = 0;
      for (const userId of userIds) {
        const { error } = await admin
          .from("memberships")
          .insert({ user_id: userId, restaurant_id: r.id, team_id: t.id });
        if (!error) joined++;
        else if (!error.message.includes("duplicate")) console.warn(`  ⚠ membership: ${error.message}`);
      }
      console.log(`  ${TYPE_EMOJI[team.type]} ${team.name} — ${joined} nouveau(x) membre(s) / ${team.members}, €${team.totalSpent} cumulés`);
    }
  }
  console.log("✅ Seed terminé");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
