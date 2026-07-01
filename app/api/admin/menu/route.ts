import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { getRestaurantId } from "@/lib/restaurant";
import { getMenuItems, upsertMenuCatalog, parseMenuCsv } from "@/lib/menu";

// GET /api/admin/menu — liste du catalogue de l'établissement.
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const items = await getMenuItems(getRestaurantId());
    return NextResponse.json(items);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// POST /api/admin/menu — upload du catalogue. Body : { csv: string }.
// Parse le CSV (nom, categorie, prix_vente, prix_revient), upsert et
// désactive les articles absents du nouveau fichier (ADR 0013).
export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  const csv = body?.csv;
  if (typeof csv !== "string" || csv.trim() === "") {
    return NextResponse.json({ error: "CSV manquant." }, { status: 400 });
  }

  const { items, errors } = parseMenuCsv(csv);
  if (items.length === 0) {
    return NextResponse.json(
      { error: "Aucune ligne valide dans le fichier.", details: errors },
      { status: 400 }
    );
  }

  try {
    const result = await upsertMenuCatalog(getRestaurantId(), items);
    return NextResponse.json({ ok: true, ...result, warnings: errors });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
