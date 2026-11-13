// Récupère les polices du site (Google Fonts, licence OFL) en woff2, sous-ensemble « latin » seulement, dans app/fonts/.
//
// Pourquoi : `next/font/google` télécharge les polices PENDANT le build, sur le réseau de Vercel et de la CI. Quand Google
// ne répond pas, le build échoue (« Can't resolve '@vercel/turbopack-next/internal/font/google/font' », constaté les
// 2026-11-13 sur les PR #435, #441, #444, #445) alors que le code n'a rien à voir. Les fichiers sont donc dans le dépôt
// et chargés par `next/font/local` : plus aucun accès réseau au build.
//
// Usage (à relancer seulement pour changer de polices ou de graisses, jamais au build) :
//   node scripts/fonts/fetch-fonts.mjs
// Le jeu de caractères « latin » couvre le français (accents, œ, €, tirets, apostrophes), comme avant (subsets: ["latin"]).

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "fonts");
// Un agent de navigateur récent : sans lui, Google renvoie du TTF au lieu de woff2.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// slug = début du nom de fichier ; query = la partie `family=` de l'API CSS de Google (mêmes graisses que app/layout.tsx).
const FAMILIES = [
  { slug: "inter", query: "Inter:wght@100..900" },
  { slug: "manrope", query: "Manrope:wght@200..800" },
  { slug: "poppins", query: "Poppins:wght@400;600;700" },
  { slug: "playfair-display", query: "Playfair+Display:wght@400..900" },
  { slug: "dm-sans", query: "DM+Sans:wght@100..1000" },
  { slug: "bebas-neue", query: "Bebas+Neue" },
  { slug: "space-grotesk", query: "Space+Grotesk:wght@500;600;700" },
  { slug: "jetbrains-mono", query: "JetBrains+Mono:wght@400;500;600" },
  { slug: "archivo", query: "Archivo:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700" },
  { slug: "archivo-black", query: "Archivo+Black" },
  { slug: "instrument-sans", query: "Instrument+Sans:wght@400;500;600;700" },
];

async function get(url, asText) {
  const res = await fetch(url, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`${url} : HTTP ${res.status}`);
  return asText ? res.text() : Buffer.from(await res.arrayBuffer());
}

/** Les blocs @font-face du sous-ensemble « latin » (pas latin-ext, cyrillic, grec, vietnamien). */
function latinFaces(css) {
  const faces = [];
  const re = /\/\*\s*([a-z-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g;
  for (const m of css.matchAll(re)) {
    if (m[1] !== "latin") continue;
    const body = m[2];
    faces.push({
      style: /font-style:\s*([a-z]+)/.exec(body)?.[1] ?? "normal",
      weight: /font-weight:\s*([0-9 ]+);/.exec(body)?.[1].trim() ?? "400",
      url: /url\((https:[^)]+\.woff2)\)/.exec(body)?.[1],
    });
  }
  return faces.filter((f) => f.url);
}

await mkdir(OUT, { recursive: true });
const manifest = [];
for (const fam of FAMILIES) {
  const css = await get(`https://fonts.googleapis.com/css2?family=${fam.query}&display=swap`, true);
  const faces = latinFaces(css);
  if (faces.length === 0) throw new Error(`${fam.slug} : aucun bloc « latin » trouvé`);
  // Un même fichier peut servir plusieurs graisses (police variable) : on le nomme d'après TOUTES les graisses qu'il sert.
  const groups = new Map();
  for (const f of faces) {
    const g = groups.get(f.url) ?? { style: f.style, weights: [] };
    g.weights.push(f.weight.replace(/\s+/g, "-"));
    groups.set(f.url, g);
  }
  const names = new Map();
  for (const [url, g] of groups) {
    const name = `${fam.slug}-${g.style}-${g.weights.join("_")}.woff2`;
    const bytes = await get(url, false);
    await writeFile(join(OUT, name), bytes);
    names.set(url, name);
  }
  for (const f of faces) manifest.push({ family: fam.slug, style: f.style, weight: f.weight, file: names.get(f.url) });
  console.log(`${fam.slug} : ${faces.length} déclaration(s), ${groups.size} fichier(s)`);
}
await writeFile(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`\n${manifest.length} déclarations écrites dans app/fonts/manifest.json`);
