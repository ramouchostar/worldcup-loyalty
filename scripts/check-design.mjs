#!/usr/bin/env node
// Contrôle de la charte anti-slop (ADR 0090), en cliquet.
//
// Compte, fichier par fichier, les motifs que la charte interdit (dégradé, verre
// dépoli, flou décoratif, icônes Lucide, ancien vert acide). Les comptes actuels
// sont figés dans scripts/design-baseline.json : le CI refuse qu'un compte
// augmente ou qu'un nouveau fichier en contienne. On nettoie page après page ;
// quand un compte baisse, `node scripts/check-design.mjs --update` fige le progrès.
//
// Une exception justifiée (un vrai graphique, un fichier tiers) s'écrit sur la
// même ligne : `design-ok: <raison>`. Elle n'est pas comptée.

import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const BASELINE = join(ROOT, "scripts/design-baseline.json");
const DIRS = ["app", "components"];
const EXT = /\.(tsx?|css)$/;

const RULES = {
  degrade: /(linear|radial|conic)-gradient\(|\bbg-gradient-to-/g,
  verre: /backdrop-blur|backdrop-filter/g,
  flou: /\bblur-(xl|2xl|3xl)\b|filter:\s*blur\(/g,
  lucide: /from\s+["']lucide-react["']/g,
  "vert-acide": /#a2c523|\b(bg|text|border|ring|fill|stroke|decoration|from|to|outline)-moss\b/gi,
};

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (EXT.test(name)) out.push(p);
  }
  return out;
}

const counts = {};
for (const dir of DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const rel = relative(ROOT, file);
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (line.includes("design-ok:")) continue;
      for (const [rule, re] of Object.entries(RULES)) {
        const n = line.match(re)?.length ?? 0;
        if (n) {
          counts[rule] ??= {};
          counts[rule][rel] = (counts[rule][rel] ?? 0) + n;
        }
      }
    }
  }
}

if (process.argv.includes("--update")) {
  writeFileSync(BASELINE, JSON.stringify(counts, null, 2) + "\n");
  const total = Object.values(counts).reduce((s, r) => s + Object.values(r).reduce((a, b) => a + b, 0), 0);
  console.log(`Base de la charte mise à jour : ${total} occurrences restantes.`);
  process.exit(0);
}

const base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : {};
const errors = [];
let improved = 0;
for (const rule of Object.keys(RULES)) {
  const now = counts[rule] ?? {};
  const before = base[rule] ?? {};
  for (const [file, n] of Object.entries(now)) {
    const b = before[file] ?? 0;
    if (n > b) errors.push(`${file} : ${rule} ${b} → ${n}`);
  }
  for (const [file, b] of Object.entries(before)) if ((now[file] ?? 0) < b) improved++;
}

if (errors.length) {
  console.error("✗ Charte anti-slop (ADR 0090) : de nouveaux motifs interdits sont apparus.");
  for (const e of errors) console.error("  " + e);
  console.error("Retirer le motif, ou justifier une vraie exception avec `design-ok: <raison>` sur la ligne.");
  process.exit(1);
}
console.log(`✓ Charte anti-slop : rien de nouveau${improved ? ` (${improved} fichier(s) en progrès : lancer --update pour figer)` : ""}.`);
