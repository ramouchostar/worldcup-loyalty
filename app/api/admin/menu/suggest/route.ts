import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { getRestaurantId } from "@/lib/restaurant";
import { suggestRewardGrid } from "@/lib/menu-suggest";

// POST /api/admin/menu/suggest — propose un article par palier à partir du
// catalogue (ADR 0013). L'admin accepte ou remplace ; jamais auto-appliqué.
export async function POST() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  try {
    const result = await suggestRewardGrid(getRestaurantId());
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
