import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { readZones, saveZones, supabaseZonesDb } from "@/lib/menu-options/zones-save";

// ADR 0100 §9 — le coin de cuisine de chaque plat (console seulement).
//
// GET /api/admin/menu/options/zones?restaurantId=…  → { zones: { [articleId]: coin | null } | null }
//   `zones: null` = la migration des coins n'est pas appliquée : l'écran le dit, rien ne casse.
// PUT /api/admin/menu/options/zones  { restaurantId, rows: [{ articleId, zone }], trace }
//   Le serveur nettoie les noms, vérifie que chaque plat est celui de l'établissement, puis écrit.

export async function GET(req: NextRequest) {
  const restaurantId = req.nextUrl.searchParams.get("restaurantId") ?? "";
  if (!restaurantId) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;
  try {
    return NextResponse.json({ zones: await readZones(restaurantId) });
  } catch (e) {
    console.error("[menu-zones] lecture :", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  if (!restaurantId) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  const result = await saveZones(supabaseZonesDb(), restaurantId, body.rows, body.trace, guard.userId);
  if (!result.ok) {
    const { status, ...rest } = result;
    return NextResponse.json(rest, { status });
  }
  console.info(`[menu-zones-save] restaurant=${restaurantId} user=${guard.userId} plats=${result.rows} trace=${result.traceSaved}`);
  return NextResponse.json(result);
}
