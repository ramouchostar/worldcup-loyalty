#!/usr/bin/env node
// Lance les tests unitaires (lib/**/*.test.ts) via tsx + node:test.
// Pourquoi un script : `node --test` ne résout pas les globs sur Node 20 ni
// sous cmd.exe — on liste les fichiers nous-mêmes. `npm test` partout (local,
// CI, Windows/mac/Linux).
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function collect(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) collect(p, out);
    else if (/\.test\.ts$/.test(name)) out.push(p);
  }
  return out;
}

const files = collect("lib");
if (files.length === 0) { console.log("Aucun test."); process.exit(0); }
const bin = process.platform === "win32" ? "npx.cmd" : "npx";
const r = spawnSync(bin, ["--no-install", "tsx", "--test", ...files], { stdio: "inherit", shell: process.platform === "win32" });
process.exit(r.status ?? 1);
