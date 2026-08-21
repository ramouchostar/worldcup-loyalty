// ============================================================================
// ROTATION DU MOT DE PASSE DES COMPTES DE TEST (@seed.boosteats.test)
//
// Pourquoi : le mot de passe de seed a vécu en clair dans un repo PUBLIC, et
// super@seed.boosteats.test est super-admin de PROD. Ce script change le mot
// de passe de TOUS les comptes du domaine de seed vers la valeur de
// SEED_PASSWORD (variable d'environnement, JAMAIS commitée).
//
// Usage :
//   SEED_PASSWORD='un-nouveau-secret-long' node scripts/rotate-seed-passwords.mjs
//   (sans SEED_PASSWORD : en génère un, le change partout et l'affiche UNE fois)
//
// Idempotent : rejouable (remet simplement le même mot de passe).
// ============================================================================
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
if (typeof globalThis.WebSocket === "undefined") { globalThis.WebSocket = class { constructor() {} close() {} }; }
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const DOMAIN = "@seed.boosteats.test";
const generated = !process.env.SEED_PASSWORD;
const PW = process.env.SEED_PASSWORD || `Seed-${randomBytes(9).toString("base64url")}!${new Date().getFullYear()}`;
if (PW.length < 12) { console.error("SEED_PASSWORD trop court (≥ 12 caractères)."); process.exit(1); }

// Tous les profils du domaine de seed (paginé)
const ids = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await admin.from("profiles").select("id, email").ilike("email", `%${DOMAIN}`).range(from, from + 999);
  if (error) throw new Error(error.message);
  ids.push(...(data ?? []));
  if (!data || data.length < 1000) break;
}
console.log(`${ids.length} comptes ${DOMAIN} → rotation du mot de passe…`);

let ok = 0, ko = 0;
for (let i = 0; i < ids.length; i += 10) {
  const batch = await Promise.all(ids.slice(i, i + 10).map((p) => admin.auth.admin.updateUserById(p.id, { password: PW })));
  for (const r of batch) r.error ? ko++ : ok++;
  if ((i + 10) % 200 === 0) console.log(`  ${Math.min(i + 10, ids.length)}/${ids.length}`);
}
console.log(`✓ ${ok} mots de passe changés${ko ? `, ${ko} échecs` : ""}.`);
if (generated) {
  console.log("\nNOUVEAU MOT DE PASSE DE SEED (note-le, il ne sera plus affiché) :");
  console.log(`  ${PW}`);
  console.log("\nÀ mettre dans .env.local (et chez ton associé) : SEED_PASSWORD=…");
}
