import { NextResponse } from "next/server";
import { requireAdmin, getAdminAccess } from "./admin-guard";
import { marketplaceEnabled } from "./missions";

// ADR 0084 — garde commune des routes /api/admin/missions : restaurateur de CET
// établissement (requireAdmin), module ouvert (MARKETPLACE_ENABLED, ou super-admin).
// Un module fermé répond 404 : il n'existe pas encore pour ce restaurateur.
export async function requireMarketplace(
  restaurantId: string
): Promise<{ ok: true; userId: string } | { ok: false; response: NextResponse }> {
  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard;
  const access = await getAdminAccess(guard.userId, restaurantId);
  if (!marketplaceEnabled(access.isSuperAdmin)) {
    return { ok: false, response: NextResponse.json({ error: "Introuvable." }, { status: 404 }) };
  }
  return { ok: true, userId: guard.userId };
}
