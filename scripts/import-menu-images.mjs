// Import des photos produits d'un établissement vers le catalogue menu.
//
// Pourquoi un fichier en entrée et pas une URL : les plateformes de livraison
// (Uber Eats en tête) servent leurs pages derrière un défi Cloudflare — un
// fetch serveur-à-serveur reçoit un HTTP 403 « Just a moment… ». En revanche le
// CDN qui sert les images (tb-static.uber.com) répond normalement. Le
// restaurateur ouvre donc SA page dans SON navigateur (il passe le défi en tant
// qu'humain), l'enregistre (Cmd+S → « page web, HTML seul »), et ce script fait
// tout le reste : extraction, rapprochement catalogue, téléchargement,
// re-hébergement dans Supabase Storage, écriture en base.
//
// On re-héberge TOUJOURS : pas de hotlink vers le CDN d'un tiers, et l'image
// survit à un changement de plateforme. Le restaurateur doit être propriétaire
// des photos qu'il fournit — `image_source` garde la trace de la provenance.
//
// Usage :
//   node scripts/import-menu-images.mjs --file ~/Downloads/kraainem.html \
//        --restaurant kraainem [--source ubereats] [--dry-run] [--overwrite]
//
// Migration requise : docs/migrations/20260912-1120-menu-item-images.sql
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
  globalThis.WebSocket = class { constructor() {} close() {} };
}

// ─── Arguments ───────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
const flag = (name) => argv.includes(`--${name}`);

const FILE = arg("file");
const RESTAURANT = arg("restaurant");
const SOURCE = arg("source", "ubereats");
const DRY_RUN = flag("dry-run");
const OVERWRITE = flag("overwrite");
const BUCKET = "menu-images";

if (!FILE || !RESTAURANT) {
  console.error("Usage : node scripts/import-menu-images.mjs --file <page.html> --restaurant <id> [--source ubereats] [--dry-run] [--overwrite]");
  process.exit(1);
}

// ─── Réplique de lib/menu-match.ts (script .mjs — pas d'import TS) ───────────
const normalizeItemName = (s) =>
  s.trim().toLowerCase().normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\bchilli\b/g, "chili")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const canonicalize = (raw) => {
  let s = String(raw).split(/\s\+\s/)[0].trim();
  for (;;) {
    const m = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(s);
    if (!m || m[1].trim() === "" || /\d/.test(m[2])) break;
    s = m[1].trim();
  }
  return normalizeItemName(s);
};

// ─── Extraction : nom d'article ↔ URL d'image ────────────────────────────────
// Volontairement agnostique au schéma de la plateforme : on ne code en dur
// aucun chemin JSON (il change sans préavis). On parcourt toute structure JSON
// trouvée dans la page et on retient tout objet qui porte À LA FOIS un libellé
// et une URL d'image. Idem pour Deliveroo ou Takeaway.
const IMAGE_HOSTS = /(tb-static\.uber\.com|cloudfront\.net|ubereats\.com\/.*image|deliveroo\.net|takeaway\.com)/i;
const isImageUrl = (v) =>
  typeof v === "string" && /^https?:\/\//.test(v) &&
  (IMAGE_HOSTS.test(v) || /\.(jpe?g|png|webp|avif)(\?|$)/i.test(v));

const NAME_KEYS = /^(title|name|itemname|displayname|label)$/i;
const IMAGE_KEYS = /(image|photo|picture|thumbnail)/i;

function collectPairs(node, out, seen = new Set()) {
  if (!node || typeof node !== "object") return out;
  if (seen.has(node)) return out;
  seen.add(node);

  if (!Array.isArray(node)) {
    const keys = Object.keys(node);
    const nameKey = keys.find((k) => NAME_KEYS.test(k) && typeof node[k] === "string" && node[k].trim());
    // L'URL peut être directe ("imageUrl": "https://…") ou nichée
    // ("image": { "url": "https://…" }) — les deux formes existent.
    let url = null;
    for (const k of keys) {
      if (!IMAGE_KEYS.test(k)) continue;
      const v = node[k];
      if (isImageUrl(v)) { url = v; break; }
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const nested = Object.values(v).find(isImageUrl);
        if (nested) { url = nested; break; }
      }
      if (Array.isArray(v)) {
        const nested = v.find(isImageUrl) ?? v.map((e) => e && typeof e === "object" ? Object.values(e).find(isImageUrl) : null).find(Boolean);
        if (nested) { url = nested; break; }
      }
    }
    if (nameKey && url) out.push({ name: node[nameKey].trim(), url });
  }

  for (const v of Array.isArray(node) ? node : Object.values(node)) {
    if (v && typeof v === "object") collectPairs(v, out, seen);
  }
  return out;
}

// Décodage du state sérialisé dans la page. Mesuré sur une page Uber Eats
// réelle : TOUS les guillemets structurants sont écrits `\u0022`, et un
// guillemet interne à une valeur est écrit `%5C\u0022` (backslash
// URL-encodé). Sans cette seconde règle, la première chaîne contenant du HTML
// inline (`<span style=%5C"color:#757575%5C">`) casse le parsing.
function decodePage(raw) {
  return raw
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/%5C"/g, '\\"');
}

// Fin de l'objet JSON ouvert en `i` — conscient des chaînes et des échappements.
function objectEnd(t, i) {
  let depth = 0, inString = false;
  for (let k = i; k < t.length; k++) {
    const c = t[k];
    if (inString) {
      if (c === "\\") k++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; continue; }
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return k + 1;
  }
  return -1;
}

// On ne parse JAMAIS le document entier : sur une page Uber réelle il reste
// des champs malformés même décodés (`metaJson` embarque un second JSON
// ré-encodé). On isole donc chaque objet qui porte une clé d'image et on ne
// parse que celui-là ; collectPairs décide ensuite s'il porte un libellé.
function harvestObjects(text, out) {
  for (const m of text.matchAll(/"[A-Za-z_]*(?:image|photo|picture|thumbnail)[A-Za-z_]*"\s*:/gi)) {
    let p = m.index, tries = 0;
    while (p >= 0 && tries < 12) {
      p = text.lastIndexOf("{", p - 1);
      if (p < 0) break;
      tries++;
      const e = objectEnd(text, p);
      if (e < 0 || e < m.index) continue; // objet clos avant la clé : on remonte
      try { collectPairs(JSON.parse(text.slice(p, e)), out); break; } catch { /* cran suivant */ }
    }
  }
  return out;
}

const rawPage = readFileSync(FILE, "utf8");
const pairs = [];
// Entrée déjà JSON (export d'API marchand) : parcours direct.
try { collectPairs(JSON.parse(rawPage), pairs); } catch { /* page HTML enregistrée */ }
if (pairs.length === 0) harvestObjects(decodePage(rawPage), pairs);

// Dédoublonnage : une même photo apparaît souvent plusieurs fois (carrousel,
// section « populaires », modale). On garde la première occurrence par nom.
const byName = new Map();
for (const p of pairs) {
  const key = canonicalize(p.name);
  if (key && !byName.has(key)) byName.set(key, p);
}

console.log(`Page   : ${FILE}`);
console.log(`Trouvé : ${pairs.length} paires nom/image, ${byName.size} articles distincts`);
if (byName.size === 0) {
  console.error("\nAucune paire nom/image extraite. Vérifie que la page a bien été");
  console.error("enregistrée APRÈS chargement complet (scrolle le menu entier avant Cmd+S :");
  console.error("les sections sont chargées à la demande).");
  process.exit(1);
}

// ─── Rapprochement avec le catalogue ─────────────────────────────────────────
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Tolérant à l'absence de la migration (règle du repo) : sans la colonne, le
// --dry-run reste utilisable pour vérifier le rapprochement AVANT de toucher la
// prod ; seule l'écriture exige la migration.
let migrated = true;
let { data: items, error: itemsErr } = await admin
  .from("menu_items")
  .select("id, name, image_path")
  .eq("restaurant_id", RESTAURANT);

if (itemsErr && /image_path/.test(itemsErr.message)) {
  migrated = false;
  ({ data: items, error: itemsErr } = await admin
    .from("menu_items")
    .select("id, name")
    .eq("restaurant_id", RESTAURANT));
}

if (itemsErr) {
  console.error("Lecture du catalogue impossible :", itemsErr.message);
  process.exit(1);
}
if (!migrated) {
  console.log("\n⚠ Colonne image_path absente — migration 20260912-1120-menu-item-images.sql non appliquée.");
  if (!DRY_RUN) {
    console.error("  Applique-la dans l'éditeur SQL Supabase avant d'importer (ou relance avec --dry-run).");
    process.exit(1);
  }
  console.log("  Le --dry-run continue : seul le rapprochement est vérifié.\n");
}
if (!items?.length) {
  console.error(`Aucun article au catalogue pour « ${RESTAURANT} » — importe d'abord le CSV via /admin/menu.`);
  process.exit(1);
}

// Alias de rapprochement déjà posés pour ce resto (ADR 0046) : les libellés de
// la plateforme de livraison souffrent des mêmes écarts que ceux de la caisse.
const { data: aliases } = await admin
  .from("menu_item_aliases")
  .select("alias, menu_item_id")
  .eq("restaurant_id", RESTAURANT);

const aliasMap = new Map((aliases ?? []).map((a) => [a.alias, a.menu_item_id]));
const catalog = new Map(items.map((i) => [normalizeItemName(i.name), i]));
const byId = new Map(items.map((i) => [i.id, i]));

const resolve = (label) => {
  const canon = canonicalize(label);
  if (aliasMap.has(canon)) {
    const id = aliasMap.get(canon);
    return id ? byId.get(id) ?? null : null; // alias → NULL = ligne à ignorer
  }
  return catalog.get(canon) ?? null;
};

const matched = [];
const unmatched = [];
for (const [, pair] of byName) {
  const item = resolve(pair.name);
  if (item) matched.push({ item, url: pair.url, label: pair.name });
  else unmatched.push(pair.name);
}

const toImport = matched.filter((m) => OVERWRITE || !m.item.image_path);
const skipped = matched.length - toImport.length;

console.log(`Rapproché : ${matched.length} / ${byName.size} articles du catalogue`);
if (skipped) console.log(`Ignoré    : ${skipped} déjà illustrés (--overwrite pour les remplacer)`);
if (unmatched.length) {
  console.log(`\nNon rapprochés (${unmatched.length}) — à traiter en alias si ce sont vos articles :`);
  for (const n of unmatched.slice(0, 20)) console.log(`  · ${n}`);
  if (unmatched.length > 20) console.log(`  … et ${unmatched.length - 20} autres`);
}

if (DRY_RUN) {
  console.log(`\n[dry-run] ${toImport.length} images seraient importées :`);
  for (const m of toImport.slice(0, 30)) console.log(`  ${m.item.name}  ←  ${m.url.slice(0, 90)}`);
  process.exit(0);
}

// ─── Téléchargement + re-hébergement ─────────────────────────────────────────
const EXT_BY_TYPE = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" };
const slug = (s) => normalizeItemName(s).replace(/\s+/g, "-").slice(0, 60);

let ok = 0;
const failures = [];

for (const { item, url } of toImport) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    const ext = EXT_BY_TYPE[type];
    if (!ext) throw new Error(`type inattendu « ${type || "inconnu"} »`);

    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength < 1024) throw new Error(`image vide (${bytes.byteLength} o)`);

    const path = `${RESTAURANT}/${slug(item.name)}.${ext}`;
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: type, upsert: true });
    if (upErr) throw new Error(`storage : ${upErr.message}`);

    const { error: dbErr } = await admin
      .from("menu_items")
      .update({ image_path: path, image_source: SOURCE })
      .eq("id", item.id);
    if (dbErr) throw new Error(`base : ${dbErr.message}`);

    ok++;
    console.log(`  ✓ ${item.name} → ${path} (${Math.round(bytes.byteLength / 1024)} ko)`);
  } catch (e) {
    failures.push({ name: item.name, reason: e.message });
    console.log(`  ✗ ${item.name} — ${e.message}`);
  }
}

console.log(`\n${ok} image(s) importée(s), ${failures.length} échec(s).`);
if (failures.length) process.exitCode = 1;
