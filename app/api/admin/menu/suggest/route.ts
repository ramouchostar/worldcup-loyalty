import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { suggestRewardGrid } from "@/lib/menu-suggest";

// POST /api/admin/menu/suggest — propose un article par palier à partir du
// catalogue (ADR 0013). L'admin accepte ou remplace ; jamais auto-appliqué.
// Body : { restaurantId }.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const restaurantId = body?.restaurantId;
  if (typeof restaurantId !== "string" || !restaurantId) {
    return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  }

  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  try {
    const result = await suggestRewardGrid(restaurantId);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
