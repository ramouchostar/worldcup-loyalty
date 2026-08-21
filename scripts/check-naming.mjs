#!/usr/bin/env node
// Vérifie que deux personnes (ou deux agents) ne se marchent pas sur les pieds
// dans le nommage des fichiers numérotés — ADR et migrations SQL.
// Lancé en CI (.github/workflows/ci.yml) et à la main : `npm run check:naming`.
//
// Règles (CLAUDE.md § Collaboration) :
//  1. docs/adr/NNNN-slug.md : préfixe NNNN unique.
//  2. docs/mNN-*.sql (héritage, m1..m60) : FIGÉ — plus aucune nouvelle
//     migration sous cette forme (les collisions passées sont tolérées, pas
//     les nouvelles).
//  3. docs/migrations/YYYYMMDD-HHMM-slug.sql : format horodaté obligatoire,
//     préfixe unique — impossible de collisionner à deux.
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const errors = [];
const notes = [];

// ── 1. ADR ───────────────────────────────────────────────────────────────────
const adrDir = join(ROOT, "docs", "adr");
if (existsSync(adrDir)) {
  const seen = new Map();
  for (const f of readdirSync(adrDir).filter((f) => f.endsWith(".md"))) {
    const m = f.match(/^(\d{4})-[a-z0-9-]+\.md$/);
    if (!m) {
      errors.push(`ADR mal nommé : docs/adr/${f} (attendu NNNN-slug-en-minuscules.md)`);
      continue;
    }
    const prev = seen.get(m[1]);
    if (prev) errors.push(`ADR ${m[1]} en doublon : ${prev} et ${f} — prends le numéro suivant de origin/master`);
    else seen.set(m[1], f);
  }
  notes.push(`ADR : ${seen.size} fichiers, dernier = ${[...seen.keys()].sort().at(-1) ?? "—"}`);
}

// ── 2. Migrations héritées docs/mNN-*.sql (figées) ──────────────────────────
// Dernier numéro de l'ère séquentielle. Tout mNN > LAST_LEGACY est refusé :
// les nouvelles migrations vont dans docs/migrations/ (format horodaté).
const LAST_LEGACY = 60;
// Collisions historiques tolérées (déjà appliquées en prod, on ne renomme pas).
const LEGACY_DUPLICATES_OK = new Set([8, 15, 28, 29, 36, 37, 48, 50]);
const docsDir = join(ROOT, "docs");
const legacy = readdirSync(docsDir).filter((f) => /^m\d+[a-z]?-.*\.sql$/.test(f));
const byNumber = new Map();
for (const f of legacy) {
  const n = Number(f.match(/^m(\d+)/)[1]);
  if (n > LAST_LEGACY) {
    errors.push(
      `Migration ${f} : la numérotation mNN est figée à m${LAST_LEGACY}. ` +
        `Crée-la dans docs/migrations/YYYYMMDD-HHMM-slug.sql (voir docs/migrations/README.md).`
    );
  }
  byNumber.set(n, [...(byNumber.get(n) ?? []), f]);
}
for (const [n, files] of byNumber) {
  if (files.length > 1 && !LEGACY_DUPLICATES_OK.has(n)) {
    errors.push(`Migration m${n} en doublon : ${files.join(", ")}`);
  }
}
notes.push(`Migrations héritées : ${legacy.length} fichiers (m1…m${LAST_LEGACY}, figées)`);

// ── 3. Nouvelles migrations docs/migrations/ (horodatées) ───────────────────
const migDir = join(ROOT, "docs", "migrations");
if (existsSync(migDir)) {
  const seen = new Map();
  const files = readdirSync(migDir).filter((f) => f.endsWith(".sql"));
  for (const f of files) {
    const m = f.match(/^(\d{8}-\d{4})-[a-z0-9-]+\.sql$/);
    if (!m) {
      errors.push(`Migration mal nommée : docs/migrations/${f} (attendu YYYYMMDD-HHMM-slug-en-minuscules.sql)`);
      continue;
    }
    const prev = seen.get(m[1]);
    if (prev) errors.push(`Migrations avec le même horodatage : ${prev} et ${f} — décale d'une minute`);
    else seen.set(m[1], f);
  }
  notes.push(`Migrations horodatées : ${files.length} fichier(s)`);
}

// ── 4. Anti-secret : le repo est PUBLIC — aucun mot de passe / clé en dur ──
// (incident 2026-08-21 : le mot de passe des comptes de test, dont un
// super-admin de prod, a vécu en clair dans scripts/seed-audit.mjs.)
import { execSync } from "node:child_process";
const SECRET_PATTERNS = [
  [/SeedTest!2026x/, "ancien mot de passe de seed (roté — ne doit plus apparaître)"],
  [/SEED_PASSWORD\s*=\s*["'][^"'\s]{6,}["']/, "SEED_PASSWORD en dur (doit venir de l'environnement)"],
  [/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]{20,}/, "JWT Supabase (clé anon/service) en dur"],
  [/sk_(live|test)_[A-Za-z0-9]{16,}/, "clé Stripe en dur"],
  // même ligne, valeur réelle (pas vide, pas une substitution ${VAR} ni un <placeholder>)
  [/SUPABASE_SERVICE_ROLE_KEY[ \t]*=[ \t]*(?!\$\{)(?!<)[^\s"']{20,}/, "clé service-role en dur"],
];
try {
  const tracked = execSync("git ls-files", { encoding: "utf8" }).split(/\r?\n/).filter((f) => f && /\.(mjs|js|ts|tsx|md|json|sql|yml|yaml|env\.example)$/.test(f) && !f.startsWith("node_modules/"));
  for (const f of tracked) {
    if (f === "scripts/check-naming.mjs") continue; // contient les motifs eux-mêmes
    let content = "";
    try { content = readFileSync(join(ROOT, f), "utf8"); } catch { continue; } // fichier de travail (attrape AVANT le commit)
    for (const [re, why] of SECRET_PATTERNS) if (re.test(content)) errors.push(`Secret en dur dans ${f} : ${why}`);
  }
  notes.push(`Anti-secret : ${tracked.length} fichiers suivis scannés`);
} catch (e) {
  notes.push(`Anti-secret : scan ignoré (${e.message.split("\n")[0]})`);
}

// ── Verdict ──────────────────────────────────────────────────────────────────
for (const n of notes) console.log(`• ${n}`);
if (errors.length) {
  console.error(`\n✗ ${errors.length} problème(s) de nommage :`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("✓ Nommage ADR / migrations : OK");
