import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase";
import { parseSalesRows, parseRowsFromGrid, type ColumnMapping } from "@/lib/sales-import";
import { ensureTrialStarted } from "@/lib/entitlements";

// Import des ventes de caisse (ADR 0027). Surface ADMIN uniquement — jamais
// une API publique ne renvoie de vente caisse (régression ADR 0007 sinon).
// Le remplacement par plage de dates est fait par le RPC transactionnel
// import_restaurant_sales (m45).
//
// Deux sources : CSV brut (`csvText`, parsé ici) ou grille déjà extraite d'un
// .xlsx côté client (`rows`). Dans les deux cas, la validation cellule par
// cellule est refaite ici — le serveur reste l'autorité. Le .xlsx est dézippé
// côté navigateur : aucun binaire non fiable n'atteint notre serveur.

const MAX_TEXT = 25 * 1024 * 1024; // 25 Mo de CSV brut
const MAX_ROWS = 200_000;

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    restaurantId?: string;
    csvText?: string;
    rows?: unknown;
    mapping?: Partial<ColumnMapping>;
    filename?: string;
  } | null;

  const restaurantId = body?.restaurantId;
  if (typeof restaurantId !== "string" || !restaurantId) {
    return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  }

  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  const mapping = body?.mapping;
  if (!mapping || typeof mapping.date !== "number" || typeof mapping.amount !== "number") {
    return NextResponse.json({ error: "Colonnes date et montant requises." }, { status: 400 });
  }
  const colMapping: ColumnMapping = {
    date: mapping.date,
    amount: mapping.amount,
    time: typeof mapping.time === "number" ? mapping.time : null,
  };

  let parsed: ReturnType<typeof parseSalesRows>;
  if (Array.isArray(body?.rows)) {
    const grid = body.rows as unknown[];
    if (grid.length > MAX_ROWS) {
      return NextResponse.json(
        { error: `Trop de lignes (> ${MAX_ROWS.toLocaleString("fr-BE")}). Découpe le fichier par période.` },
        { status: 413 }
      );
    }
    const rows: string[][] = grid.map((r) =>
      Array.isArray(r) ? (r as unknown[]).map((c) => String(c ?? "")) : []
    );
    parsed = parseRowsFromGrid(rows, colMapping);
  } else {
    const csvText = body?.csvText;
    if (typeof csvText !== "string" || csvText.length === 0) {
      return NextResponse.json({ error: "Fichier vide." }, { status: 400 });
    }
    if (csvText.length > MAX_TEXT) {
      return NextResponse.json({ error: "Fichier trop lourd — découpe-le par période." }, { status: 413 });
    }
    parsed = parseSalesRows(csvText, colMapping);
  }

  if (parsed.rows.length === 0) {
    return NextResponse.json(
      {
        error: "Aucune ligne exploitable — vérifie le choix des colonnes date et montant.",
        dropped: parsed.dropped,
        errors: parsed.errors,
      },
      { status: 422 }
    );
  }
  if (parsed.rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `Trop de lignes (> ${MAX_ROWS.toLocaleString("fr-BE")}). Découpe le fichier par période.` },
      { status: 413 }
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("import_restaurant_sales", {
    p_restaurant_id: restaurantId,
    p_filename: body?.filename ?? null,
    p_imported_by: guard.userId,
    p_rows: parsed.rows,
  });

  if (error) {
    return NextResponse.json({ error: "Échec de l'import des ventes." }, { status: 500 });
  }

  // ADR 0029 §5 — l'import rend forecast/ventes data-ready : l'essai 30 j
  // démarre maintenant (idempotent, best-effort).
  await Promise.all([
    ensureTrialStarted(restaurantId, "forecast"),
    ensureTrialStarted(restaurantId, "sales"),
  ]);

  return NextResponse.json({
    ok: true,
    imported: parsed.rows.length,
    dropped: parsed.dropped,
    dateMin: parsed.dateMin,
    dateMax: parsed.dateMax,
    result: data,
  });
}
