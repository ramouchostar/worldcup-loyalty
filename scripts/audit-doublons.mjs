// ============================================================================
// AUDIT RÉTROACTIF DES DOUBLONS — phase C du chantier d'activation.
//
// Rejoue la logique de dédoublonnage (lib/duplicate-detection.ts) sur TOUT
// l'historique des commandes validées et écrit docs/audit-doublons.md.
//
// ⚠️ STRICTEMENT EN LECTURE SEULE. Ce script n'écrit rien dans Supabase — ni
// statut de commande, ni score d'équipe, ni solde de points. Il PROPOSE des
// corrections dans le rapport ; les appliquer est une décision humaine et
// demandera un second script écrit pour ça.
//
// Le rejeu et la mise en forme vivent dans lib/duplicate-audit.ts (module pur,
// couvert par lib/duplicate-audit.test.ts) : ici, uniquement des entrées/sorties.
//
// Usage — le script importe du TypeScript, il se lance donc via tsx :
//   npm run audit:doublons                      # tous les établissements
//   npm run audit:doublons -- kraainem          # un seul
//   AUDIT_SINCE=2026-08-01 npm run audit:doublons
//
// Prérequis : NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, dans
// .env.local ou dans l'environnement.
// ============================================================================
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { replayDuplicates, buildAuditReport } from "../lib/duplicate-audit.ts";

// ── Environnement ───────────────────────────────────────────────────────────

const fileEnv = existsSync(".env.local")
  ? Object.fromEntries(
      readFileSync(".env.local", "utf8")
        .split(/\r?\n/)
        .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
        .map((l) => {
          const i = l.indexOf("=");
          return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
        })
    )
  : {};
const env = { ...fileEnv, ...process.env };

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis (.env.local ou environnement)."
  );
  process.exit(1);
}
if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class {
    constructor() {}
    close() {}
  };
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ONLY_RESTAURANT = process.argv[2] ?? null;
const SINCE = env.AUDIT_SINCE ?? "2026-01-01";
const OUT = "docs/audit-doublons.md";

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ── Lecture ─────────────────────────────────────────────────────────────────

const PAGE = 1000;

async function pagedSelect(table, columns, apply) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    let q = admin.from(table).select(columns).range(from, from + PAGE - 1);
    if (apply) q = apply(q);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE) break;
  }
  return rows;
}

/** `in(...)` a une limite pratique : on interroge par lots d'identifiants. */
async function selectByIds(table, columns, column, ids, apply) {
  const rows = [];
  for (let i = 0; i < ids.length; i += 500) {
    let q = admin.from(table).select(columns).in(column, ids.slice(i, i + 500));
    if (apply) q = apply(q);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows;
}

log("Lecture des commandes validées…");
const orders = await pagedSelect(
  "orders",
  "id, restaurant_id, user_id, amount, order_date, order_time, order_number, submitted_at",
  (q) => {
    let out = q
      .eq("status", "validated")
      .gte("order_date", SINCE)
      .order("submitted_at", { ascending: true });
    if (ONLY_RESTAURANT) out = out.eq("restaurant_id", ONLY_RESTAURANT);
    return out;
  }
);
log(`${orders.length} commande(s) validée(s).`);

const generatedAt = new Date().toISOString().slice(0, 16).replace("T", " ");

if (orders.length === 0) {
  writeFileSync(
    OUT,
    buildAuditReport({
      findings: [],
      ordersExamined: 0,
      itemsByOrder: new Map(),
      memberById: new Map(),
      since: SINCE,
      restaurantId: ONLY_RESTAURANT,
      generatedAt,
    })
  );
  log(`Rapport écrit : ${OUT} (aucune commande à examiner).`);
  process.exit(0);
}

const normalized = orders.map((o) => ({ ...o, amount: Number(o.amount) }));
const orderIds = normalized.map((o) => o.id);

log("Lecture des lignes d'articles…");
const itemRows = await selectByIds(
  "order_items",
  "order_id, raw_name, quantity, unit_price, line_index",
  "order_id",
  orderIds,
  (q) => q.order("line_index", { ascending: true })
);

const itemsByOrder = new Map();
for (const row of itemRows) {
  const list = itemsByOrder.get(row.order_id) ?? [];
  list.push({
    name: row.raw_name,
    quantity: Number(row.quantity),
    unit_price: row.unit_price === null ? null : Number(row.unit_price),
  });
  itemsByOrder.set(row.order_id, list);
}
log(`${itemRows.length} ligne(s) d'article sur ${itemsByOrder.size} commande(s).`);

log("Lecture des membres…");
const userIds = [...new Set(normalized.map((o) => o.user_id))];
const profiles = await selectByIds("profiles", "id, display_name, email", "id", userIds);
const memberById = new Map(
  profiles.map((p) => [p.id, (p.display_name ?? "").trim() || p.email || p.id.slice(0, 8)])
);

// ── Rejeu et rapport ────────────────────────────────────────────────────────

log("Rejeu de la logique de dédoublonnage…");
const findings = replayDuplicates(normalized, itemsByOrder);

const certains = findings.filter((f) => f.verdict.decision === "duplicate").length;
const aVerifier = findings.filter((f) => f.verdict.decision === "review").length;

writeFileSync(
  OUT,
  buildAuditReport({
    findings,
    ordersExamined: normalized.length,
    itemsByOrder,
    memberById,
    since: SINCE,
    restaurantId: ONLY_RESTAURANT,
    generatedAt,
  })
);

log(`Rapport écrit : ${OUT}`);
log(`  ${certains} doublon(s) certain(s), ${aVerifier} cas à vérifier.`);
log("Aucune donnée modifiée.");
