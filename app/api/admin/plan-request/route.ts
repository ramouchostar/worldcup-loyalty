import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { FEATURE_PLAN, type Feature } from "@/lib/entitlements";
import { requestPlan } from "@/lib/plan-requests";

// ADR 0029 Phase 2 — CTA du paywall doux : le restaurateur demande un plan,
// le super-admin la voit sur /platform et active à la main (pas de Stripe).
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) ?? {};
  const restaurantId = typeof body.restaurantId === "string" ? body.restaurantId : null;
  const plan = body.plan === "pro" ? "pro" : body.plan === "croissance" ? "croissance" : null;
  // Contexte commercial du clic : une surface payante connue, ou le nudge de
  // scans (Phase 3) — tout le reste est neutralisé à null.
  const feature =
    typeof body.feature === "string" && (body.feature in FEATURE_PLAN || body.feature === "scan_cap")
      ? (body.feature as Feature | "scan_cap")
      : null;

  if (!restaurantId || !plan) {
    return NextResponse.json({ error: "restaurantId et plan requis." }, { status: 400 });
  }

  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  const result = await requestPlan(restaurantId, plan, feature, guard.userId);
  if (result === "error") {
    return NextResponse.json(
      { error: "Impossible d'enregistrer la demande pour le moment. Réessaie." },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, alreadyPending: result === "already_pending" });
}
