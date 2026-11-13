import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase";
import { readItemFacts } from "@/lib/menu-options/facts";
import { countGroupsByArticle, saveLots, supabaseOptionsDb } from "@/lib/menu-options/save";

// ADR 0100 — régler les options des plats par groupes, depuis le catalogue (console, jamais côté membre : des euros).
//
// GET /api/admin/menu/options?restaurantId=…
//   → { items: [{ id, name, category, price, hasPhoto }], configured: { [articleId]: nombre de listes de choix }, available, facts }
//   `facts` = description et allergènes confirmés déjà enregistrés par plat (aperçu du site) ; `{}` si les colonnes manquent.
//   `available: false` = les tables d'options n'existent pas encore (migration pas appliquée) : l'écran le dit.
// PUT /api/admin/menu/options — { restaurantId, lots, trace }
//   Les lots sont revérifiés ici (forme, modèle d'options, appartenance des plats) : le navigateur n'est jamais cru.

export async function GET(req: NextRequest) {
  const restaurantId = req.nextUrl.searchParams.get("restaurantId") ?? "";
  if (!restaurantId) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("menu_items")
    .select("id, name, category, menu_price, image_path")
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true)
    .order("category", { ascending: true })
    .order("name", { ascending: true });
  if (error) return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });

  let counts: Map<string, number> | null;
  try {
    counts = await countGroupsByArticle(restaurantId);
  } catch (e) {
    console.error("[menu-options] lecture :", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }

  const items = ((data ?? []) as { id: string; name: string; category: string; menu_price: number; image_path: string | null }[]).map((i) => ({
    id: i.id, name: i.name, category: i.category, price: Number(i.menu_price), hasPhoto: !!i.image_path,
  }));
  // Ce qui est déjà enregistré (descriptions, allergènes confirmés) : pour l'aperçu du site. Jamais bloquant.
  let facts = {};
  try {
    facts = await readItemFacts(restaurantId);
  } catch (e) {
    console.error("[menu-options] faits :", e);
  }
  return NextResponse.json({ items, configured: Object.fromEntries(counts ?? []), available: counts !== null, facts });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  if (!restaurantId) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  const result = await saveLots(supabaseOptionsDb(), restaurantId, body.lots, body.trace, guard.userId);
  if (!result.ok) {
    const { status, ...rest } = result;
    return NextResponse.json(rest, { status });
  }
  console.info(
    `[menu-options-save] restaurant=${restaurantId} user=${guard.userId} groupes_de_plats=${result.lots} plats=${result.articles} listes=${result.groups} choix=${result.choices} trace=${result.traceSaved}`
  );
  return NextResponse.json(result);
}
