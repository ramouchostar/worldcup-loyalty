// ============================================================================
// AUDIT D'UN RESTAURANT EN LIGNE DE COMMANDE — ADR 0069.
//
// Même mesure que l'onglet /platform/audit (lib/audit/measure.ts : fiche +
// avis DataForSEO, grille, analyse, moteur de scénarios), lancée à la main.
// Écrit l'audit dans les tables restaurant_audits / restaurant_audit_sections
// (migration 20260923-2039) : il apparaît ensuite dans la console. Sans les
// tables, écrit seulement docs/../audit-<slug>.json dans le dossier courant.
//
// Usage : npx tsx scripts/audit-run.mjs "Krusty Smash Burgers Ixelles"
//         npx tsx scripts/audit-run.mjs cid:1234567890
//
// Prérequis (.env.local) : DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD,
// NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// ============================================================================
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { measure } from "../lib/audit/measure.ts";
import { isBrussels, postalCodeOf } from "../lib/audit/brussels.ts";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const i = line.indexOf("=");
    if (i > 0 && !line.startsWith("#") && !process.env[line.slice(0, i).trim()]) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
}

const arg = process.argv.slice(2).join(" ").trim();
if (!arg) {
  console.error('Usage : npx tsx scripts/audit-run.mjs "Nom Commune"  |  cid:123');
  process.exit(1);
}
const target = arg.startsWith("cid:") ? { cid: arg.slice(4) } : { keyword: arg };

const t0 = Date.now();
console.log("Mesure de", arg, "…");
const m = await measure(target);
const info = m.fiche.status === "ok" ? m.fiche.result.info : null;
const postal = info ? info.address_info?.postal_code ?? postalCodeOf(info.address) : null;

console.log(`\n${info?.title ?? arg} — ${info?.address ?? "adresse inconnue"}`);
console.log(`Bruxelles : ${isBrussels(postal) ? "oui" : "NON"} (${postal ?? "?"})`);
console.log(`Fiche : ${m.fiche.status}${m.fiche.status === "ok" ? ` — ${m.scores.fiche}/100 sur ${m.fiche.result.score.verified} critères` : ` — ${m.fiche.error}`}`);
if (m.avis.status === "ok") {
  const a = m.avis.result;
  console.log(`Avis : ${a.read} lus sur ${a.total} — note volet ${m.scores.avis}/100`);
  console.log(`  réponses 12 mois ${a.responses.share ?? "?"} · délai médian ${a.responses.medianDelayDays ?? "?"} j · bascule ${a.breakpoint ? `${a.breakpoint.month} ${a.breakpoint.before}→${a.breakpoint.after}` : "aucune nette"}`);
} else console.log(`Avis : ${m.avis.status} — ${m.avis.error}`);
console.log("Priorités :");
for (const s of m.recommendations.top) console.log("  -", s.title);
console.log(`Coût ${m.costUsd} $ · ${m.calls.dataforseo} requêtes · ${Math.round((Date.now() - t0) / 1000)} s`);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const db = url && key ? createClient(url, key) : null;
const section = (o) => (o.status === "ok"
  ? { status: "ok", source: o.source, raw: o.raw, result: o.result.score ?? o.result, cost_usd: o.cost, error: null }
  : { status: o.status, source: o.source, raw: null, result: null, cost_usd: 0, error: o.error });

const { data: audit, error } = db
  ? await db.from("restaurant_audits").insert({
      name: info?.title ?? arg,
      cid: info?.cid ?? null,
      place_id: info?.place_id ?? null,
      address: info?.address ?? null,
      postal_code: postal,
      status: !isBrussels(postal) && info ? "echec" : m.fiche.status !== "ok" && m.avis.status !== "ok" ? "echec" : "mesure",
      scores: m.scores,
      signals: m.signals,
      recommendations: m.recommendations,
      cost_usd: m.costUsd,
      calls: m.calls,
    }).select("id").single()
  : { data: null, error: { message: "Supabase non configuré" } };

if (error) {
  const file = `audit-${arg.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`;
  writeFileSync(file, JSON.stringify(m, null, 1));
  console.log(`\nPas enregistré en base (${error.message}) — résultat écrit dans ${file}`);
} else {
  const rows = [
    { audit_id: audit.id, section: "fiche", ...section(m.fiche), finished_at: new Date().toISOString() },
    { audit_id: audit.id, section: "avis", ...section(m.avis), finished_at: new Date().toISOString() },
  ];
  const { error: e2 } = await db.from("restaurant_audit_sections").upsert(rows, { onConflict: "audit_id,section" });
  console.log(e2 ? `\nAudit ${audit.id} enregistré, volets en erreur : ${e2.message}` : `\nEnregistré : /platform/audit/${audit.id}`);
}
