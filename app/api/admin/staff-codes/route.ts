import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createStaffCode, setStaffCodeActive } from "@/lib/staff-codes";

// ADR 0053 — codes du personnel en salle : créés (prénom seul) et
// activés/désactivés par la console. La lecture passe par la page serveur
// (getStaffStats), pas par cette route.

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  if (!restaurantId || !label) {
    return NextResponse.json({ error: "Prénom requis." }, { status: 400 });
  }

  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  const created = await createStaffCode(restaurantId, label);
  if (!created) {
    return NextResponse.json(
      { error: "Création impossible — la migration 20260910-1430 est-elle appliquée ?" },
      { status: 500 }
    );
  }
  return NextResponse.json({ id: created.id, code: created.code, label: created.label }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  const codeId = typeof body?.codeId === "string" ? body.codeId : "";
  const isActive = body?.isActive === true;
  if (!restaurantId || !codeId) {
    return NextResponse.json({ error: "Paramètres invalides." }, { status: 400 });
  }

  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  const ok = await setStaffCodeActive(restaurantId, codeId, isActive);
  if (!ok) return NextResponse.json({ error: "Mise à jour impossible." }, { status: 500 });
  return NextResponse.json({ success: true });
}
