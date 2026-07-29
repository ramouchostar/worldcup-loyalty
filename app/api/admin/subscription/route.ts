import { NextResponse, type NextRequest } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-guard";
import { getPlan, setPlan, type Plan } from "@/lib/entitlements";

const PLANS: Plan[] = ["gratuit", "croissance", "pro"];

// GET ?restaurantId=… → plan courant (diagnostic plateforme). Super-admin only.
export async function GET(request: NextRequest) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const restaurantId = request.nextUrl.searchParams.get("restaurantId");
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });

  const plan = await getPlan(restaurantId);
  return NextResponse.json({ restaurantId, plan });
}

// POST { restaurantId, plan } → bascule le plan (flip manuel, ADR 0029 Phase 1,
// en attendant Stripe). Super-admin only : un restaurateur ne peut pas
// s'auto-attribuer un plan payant.
export async function POST(request: NextRequest) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const body = (await request.json().catch(() => null)) ?? {};
  const restaurantId = typeof body.restaurantId === "string" ? body.restaurantId : null;
  const plan = body.plan as Plan;

  if (!restaurantId || !PLANS.includes(plan)) {
    return NextResponse.json(
      { error: "restaurantId et plan (gratuit|croissance|pro) requis." },
      { status: 400 }
    );
  }

  try {
    await setPlan(restaurantId, plan);
    return NextResponse.json({ ok: true, restaurantId, plan });
  } catch (e) {
    console.error("[api/admin/subscription] setPlan failed:", (e as Error).message);
    return NextResponse.json({ error: "Échec de la mise à jour du plan." }, { status: 500 });
  }
}
