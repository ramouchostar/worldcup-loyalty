import { NextResponse, type NextRequest } from "next/server";
import { requireEstablishmentManager } from "@/lib/admin-guard";
import { siteOrdersAvailable } from "@/lib/site-orders/access";
import { hoursEditorData, pageInfo, planInfoAction } from "@/lib/site-orders/console-info";
import { readFiche } from "@/lib/site-orders/fiche-db";
import { decideForOrder } from "@/lib/site-orders/hours-source";
import { readPageSettings, readRestaurantContact, savePageSettings, saveRestaurantContact, type SettingsPatch } from "@/lib/site-orders/page-settings-db";

// ADR 0109 §3 — « Infos de ma page » et « Mes horaires » : gérant et manager seulement, fermée comme le reste des commandes du
// site (404 sans le drapeau ET le forfait). La fiche Google n'est que lue, jamais modifiée, et rien de ce qu'elle dit n'est gardé.
//
// GET /api/admin/site-orders/info?restaurantId=…                 → PageInfo (lib/site-orders/console-info.ts)
// GET /api/admin/site-orders/info?restaurantId=…&vue=horaires    → HoursEditorData (aucune lecture Google)
// PUT /api/admin/site-orders/info { restaurantId, action, … }    → { ok: true }
//   action : contact {field, value} | offers {offers} | hours {source, weekly} | add_closure {from, to?}
//            | remove_closure {from, to} | close_today | reopen_today

export const dynamic = "force-dynamic";

const NOT_FOUND = () => NextResponse.json({ error: "Introuvable." }, { status: 404 });
const BROKEN = () => NextResponse.json({ error: "Erreur serveur. Réessaie dans un instant." }, { status: 500 });

export async function GET(req: NextRequest) {
  const restaurantId = req.nextUrl.searchParams.get("restaurantId") ?? "";
  if (!restaurantId) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const guard = await requireEstablishmentManager(restaurantId);
  if (!guard.ok) return guard.response;
  if (!(await siteOrdersAvailable(restaurantId))) return NOT_FOUND();
  const noStore = { headers: { "cache-control": "no-store" } };
  try {
    const now = new Date();
    const settings = await readPageSettings(restaurantId);
    if (req.nextUrl.searchParams.get("vue") === "horaires") return NextResponse.json(hoursEditorData(settings, now), noStore);
    const [contact, read] = await Promise.all([readRestaurantContact(restaurantId), readFiche(restaurantId, "console")]);
    if (!contact) return NOT_FOUND();
    return NextResponse.json(pageInfo({ settings, contact, read, now }), noStore);
  } catch (e) {
    console.error(`[site-page-settings] restaurant=${restaurantId} lecture :`, e);
    return BROKEN();
  }
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  if (!restaurantId) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const guard = await requireEstablishmentManager(restaurantId);
  if (!guard.ok) return guard.response;
  if (!(await siteOrdersAvailable(restaurantId))) return NOT_FOUND();
  try {
    const now = new Date();
    const settings = await readPageSettings(restaurantId);
    const plan = await planInfoAction(body, settings, now, async () => (await decideForOrder(settings, () => readFiche(restaurantId), now)).openness);
    if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: plan.status });
    const saved = plan.write.kind === "restaurant"
      ? await saveRestaurantContact(restaurantId, plan.write.field, plan.write.value)
      : await savePageSettings(restaurantId, plan.write.patch as SettingsPatch, guard.userId);
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status });
    console.info(`[site-page-settings] restaurant=${restaurantId} user=${guard.userId} geste=${body.action}${plan.write.kind === "restaurant" ? ` champ=${plan.write.field}` : ""}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(`[site-page-settings] restaurant=${restaurantId} écriture :`, e);
    return BROKEN();
  }
}
