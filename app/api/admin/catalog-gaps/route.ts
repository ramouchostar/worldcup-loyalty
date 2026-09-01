import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase";
import { getCatalogGaps } from "@/lib/catalog-gaps";
import { upsertMenuAlias } from "@/lib/menu-aliases";
import { rematchOrderItems } from "@/lib/menu-rematch";

// ADR 0046, lot 4 — boucle de complétion du catalogue. Trois gestes, chacun
// pose un alias DURABLE puis rétro-rattache l'historique :
//   add    : nouvel article (coût optionnel — migration 20260901-0020) ;
//   link   : c'est un produit existant du catalogue ;
//   ignore : pas un produit (ligne technique de caisse).

// GET /api/admin/catalog-gaps?restaurantId=…
export async function GET(request: NextRequest) {
  const restaurantId = request.nextUrl.searchParams.get("restaurantId");
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  return NextResponse.json({ gaps: await getCatalogGaps(restaurantId) });
}

// POST /api/admin/catalog-gaps — { restaurantId, action, label, … }
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const restaurantId = body?.restaurantId;
  const action = body?.action;
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  if (typeof restaurantId !== "string" || !restaurantId) {
    return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });
  }
  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;
  if (label === "") return NextResponse.json({ error: "Libellé manquant." }, { status: 400 });

  const admin = createAdminClient();

  if (action === "ignore") {
    await upsertMenuAlias(restaurantId, label, null);
    const rematched = await rematchOrderItems(restaurantId);
    return NextResponse.json({ ok: true, rematched });
  }

  if (action === "link") {
    const menuItemId = body?.menu_item_id;
    if (typeof menuItemId !== "string" || !menuItemId) {
      return NextResponse.json({ error: "Choisis l'article du catalogue à rattacher." }, { status: 400 });
    }
    await upsertMenuAlias(restaurantId, label, menuItemId);
    const rematched = await rematchOrderItems(restaurantId);
    return NextResponse.json({ ok: true, rematched });
  }

  if (action === "add") {
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const menuPrice = Number(body?.menu_price);
    const costRaw = body?.cost_price;
    const costPrice = costRaw === null || costRaw === undefined || costRaw === "" ? null : Number(costRaw);
    const category = typeof body?.category === "string" && body.category.trim() !== "" ? body.category.trim() : "Autres";

    if (name === "") return NextResponse.json({ error: "Le nom de l'article est requis." }, { status: 400 });
    if (!Number.isFinite(menuPrice) || menuPrice <= 0) {
      return NextResponse.json({ error: "Prix de vente invalide." }, { status: 400 });
    }
    if (costPrice !== null && (!Number.isFinite(costPrice) || costPrice < 0)) {
      return NextResponse.json({ error: "Prix de revient invalide." }, { status: 400 });
    }

    const { data: inserted, error } = await admin
      .from("menu_items")
      .insert({
        restaurant_id: restaurantId,
        name,
        category,
        menu_price: menuPrice,
        cost_price: costPrice,
        is_active: true,
        reward_eligible: true,
      })
      .select("id")
      .single();

    let menuItemId = inserted?.id as string | undefined;
    if (error) {
      if (/cost_price/.test(error.message) && /null/i.test(error.message)) {
        return NextResponse.json(
          { error: "Le prix de revient est requis pour l'instant (migration 20260901-0020 pas encore appliquée)." },
          { status: 400 }
        );
      }
      if (error.code === "23505") {
        // Un article du même nom existe déjà → c'était un rattachement.
        const { data: existing } = await admin
          .from("menu_items")
          .select("id")
          .eq("restaurant_id", restaurantId)
          .eq("name", name)
          .maybeSingle();
        menuItemId = existing?.id;
      }
      if (!menuItemId) return NextResponse.json({ error: "Erreur lors de l'ajout. Réessaie." }, { status: 500 });
    }

    await upsertMenuAlias(restaurantId, label, menuItemId!);
    const rematched = await rematchOrderItems(restaurantId);
    return NextResponse.json({ ok: true, menu_item_id: menuItemId, rematched });
  }

  return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
}
