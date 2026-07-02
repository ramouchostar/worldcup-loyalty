import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { getMenuItems, upsertMenuCatalog, parseMenuCsv } from "@/lib/menu";

// GET /api/admin/menu?restaurantId=... — liste du catalogue de l'établissement.
export async function GET(request: NextRequest) {
  const restaurantId = request.nextUrl.searchParams.get("restaurantId");
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });

  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  try {
    const items = await getMenuItems(restaurantId);
    return NextResponse.json(items);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// POST /api/admin/menu — upload du catalogue. Body : { csv, restaurantId }.
// Parse le CSV (nom, categorie, prix_vente, prix_revient), upsert et
// désactive les articles absents du nouveau fichier (ADR 0013).
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const csv = body?.csv;
  const restaurantId = body?.restaurantId;
  if (typeof restaurantId !== "string" || !restaurantId) {
    return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  }

  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

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
    const result = await upsertMenuCatalog(restaurantId, items);
    return NextResponse.json({ ok: true, ...result, warnings: errors });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
