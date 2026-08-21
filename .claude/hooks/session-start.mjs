#!/usr/bin/env node
// Hook SessionStart — rappels de collaboration injectés dans le contexte de
// chaque session Claude (les deux associés + agents). Best-effort : ne bloque
// jamais, se tait si git/réseau indisponibles. Sortie = texte ajouté au contexte.
import { execSync } from "node:child_process";
import { statSync, existsSync } from "node:fs";

const sh = (c) => {
  try {
    return execSync(c, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 15000 }).trim();
  } catch {
    return null;
  }
};

const lines = [];
const branch = sh("git rev-parse --abbrev-ref HEAD");
if (branch) {
  sh("git fetch origin --quiet");
  const behind = sh("git rev-list --count HEAD..origin/master");
  const ahead = sh("git rev-list --count origin/master..HEAD");
  lines.push(`Branche courante : ${branch}${branch === "master" ? " — ⚠️ ne code PAS sur master : `git checkout -b claude/<sujet>` (ou /ship fera la branche)" : ""}.`);
  if (behind && Number(behind) > 0) {
    lines.push(`⚠️ origin/master a ${behind} commit(s) d'avance — le repo bouge vite (2 associés + agents) : \`git pull --ff-only origin master\` (sur master) ou rebase ta branche avant de continuer.`);
  }
  if (ahead && Number(ahead) > 0 && branch === "master") {
    lines.push(`⚠️ master local a ${ahead} commit(s) non poussé(s) — master est protégé, ils doivent passer par une branche + PR (/ship).`);
  }
}

// node_modules périmé vs package-lock.json (une dépendance ajoutée par l'autre
// casse le build sinon — cas vécu avec @next/third-parties).
try {
  if (existsSync("package-lock.json")) {
    const lock = statSync("package-lock.json").mtimeMs;
    const installed = existsSync("node_modules/.package-lock.json") ? statSync("node_modules/.package-lock.json").mtimeMs : 0;
    if (lock > installed) lines.push("⚠️ package-lock.json est plus récent que node_modules : lance `npm install` avant de builder.");
  }
} catch {}

lines.push("Rappels : une branche + une PR par chantier (/ship) · nouvelle migration → /new-migration (docs/migrations/, horodatée) · nouvel ADR → /new-adr (numéro pris sur origin/master) · `npm run check:naming` avant de pousser.");

process.stdout.write(`[collaboration] ${lines.join("\n")}\n`);
process.exit(0);
