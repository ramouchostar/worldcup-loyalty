import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";

// Un composant du NAVIGATEUR ne doit jamais, même de loin, importer du code serveur : le client Supabase
// (clé service-role, `next/headers`) ou un fichier qui le fait. Trouvé le 2026-10-13 : un formulaire du superadmin
// importait un fichier de règles qui importait aussi la base ; `next build` l'aurait refusé en production, alors que
// les tests unitaires passaient. Ce test lit les imports : il casse AVANT le build.

const ROOT = process.cwd();
const FORBIDDEN_MODULES = [/^next\/headers$/, /^server-only$/, /(^|\/)lib\/supabase$/, /^\.\/supabase$/, /^\.\.\/supabase$/];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const IMPORT = /(?:^|\n)\s*(import|export)(\s+type)?\s[^;'"]*?from\s+["']([^"']+)["']|(?:^|\n)\s*import\s+["']([^"']+)["']/g;

/** Les imports qui existent À L'EXÉCUTION : `import type` et `export type` sont effacés à la compilation. */
function importsOf(file: string): string[] {
  const src = readFileSync(file, "utf8");
  return [...src.matchAll(IMPORT)].filter((m) => !m[2]).map((m) => m[3] ?? m[4]).filter(Boolean);
}

/** Une Server Action (`"use server"`) est la frontière : le navigateur l'appelle, il ne l'embarque pas. */
const isServerAction = (file: string) => /^\s*["']use server["']/.test(readFileSync(file, "utf8"));

function resolveLocal(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? join(ROOT, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) if (existsSync(c) && statSync(c).isFile()) return normalize(c);
  return null;
}

function reachesServerCode(entry: string): string[] | null {
  const seen = new Set<string>();
  const stack: { file: string; path: string[] }[] = [{ file: entry, path: [entry] }];
  while (stack.length) {
    const { file, path } = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (file !== entry && isServerAction(file)) continue;
    for (const spec of importsOf(file)) {
      if (FORBIDDEN_MODULES.some((r) => r.test(spec)) || /\/lib\/supabase$/.test(spec)) return [...path, spec];
      const next = resolveLocal(file, spec);
      if (next && /\.(ts|tsx)$/.test(next)) {
        // Le client Supabase du NAVIGATEUR (createBrowserClient) est sain : on ne regarde que ce qui tire du serveur.
        if (/[\\/]lib[\\/]supabase\.tsx?$/.test(next)) return [...path, next];
        stack.push({ file: next, path: [...path, next] });
      }
    }
  }
  return null;
}

const clientFiles = [...walk(join(ROOT, "app")), ...walk(join(ROOT, "components"))].filter((f) => /^\s*["']use client["']/.test(readFileSync(f, "utf8")));

test("la liste des composants du navigateur est lue (le test ne passe pas à vide)", () => {
  assert.ok(clientFiles.length > 20, `${clientFiles.length} fichiers « use client » trouvés`);
});

test("aucun composant du navigateur n'importe, même de loin, du code serveur (base, service-role, next/headers)", () => {
  const offenders = clientFiles
    .map((f) => ({ f, chain: reachesServerCode(f) }))
    .filter((x) => x.chain)
    .map((x) => `${x.f.replace(ROOT, "")} → ${x.chain!.map((c) => c.replace(ROOT, "")).slice(1).join(" → ")}`);
  assert.deepEqual(offenders, []);
});

test("la détection voit un import serveur indirect (garde-fou du test lui-même)", () => {
  const fake = reachesServerCode(join(ROOT, "lib", "marketplace-settings.ts"));
  assert.ok(fake, "marketplace-settings.ts (côté serveur) est bien vu comme tirant du code serveur");
});
