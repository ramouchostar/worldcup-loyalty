import { NextResponse, type NextRequest } from "next/server";
import { canManageEstablishment, getAdminAccess, requireAdmin, requireEstablishmentManager } from "@/lib/admin-guard";
import { stopOfferArticles } from "@/lib/restaurant-posts/auto/actions";
import { autoDeps } from "@/lib/restaurant-posts/auto/server";
import { PostsUnavailableError } from "@/lib/restaurant-posts/service";
import { siteOrdersAvailable } from "@/lib/site-orders/access";
import { readPublicMenu } from "@/lib/site-orders/menu-db";
import { brusselsDay } from "@/lib/site-orders/order";
import { consoleOffers } from "@/lib/site-offers/console";
import { readFirstNames, readOfferCounts, supabaseOffersDb } from "@/lib/site-offers/db";
import type { OfferRow } from "@/lib/site-offers/offers";
import { OffersUnavailableError, answerOffer, orderableFor, publishOffer, saveDraft, stopOffer } from "@/lib/site-offers/service";

// ADR 0110 — « Offres de ta page ». Fermée comme les commandes (404 sans le drapeau ET le forfait). Écrire et publier : gérant
// et manager. Arrêter et répondre au comptoir : tout siège, équipe comprise. Aucun prix n'est jamais changé.
//
// GET  /api/admin/site-orders/offers?restaurantId=…   → { activated, canWrite, today, offers, dishes }
// POST /api/admin/site-orders/offers { restaurantId, action, … }
//   action : save {id?, copiedFrom?, offer} | publish {id, teamConfirmed} | stop {id, reason} | answer {orderId, offerId, answer}

export const dynamic = "force-dynamic";

const NOT_FOUND = () => NextResponse.json({ error: "Introuvable." }, { status: 404 });
const BROKEN = () => NextResponse.json({ error: "Erreur serveur. Réessaie dans un instant." }, { status: 500 });

export async function GET(req: NextRequest) {
  const restaurantId = req.nextUrl.searchParams.get("restaurantId") ?? "";
  if (!restaurantId) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;
  if (!(await siteOrdersAvailable(restaurantId))) return NOT_FOUND();
  const noStore = { headers: { "cache-control": "no-store" } };
  try {
    const db = supabaseOffersDb();
    const today = brusselsDay(new Date());
    const [access, offers, menu] = await Promise.all([getAdminAccess(guard.userId, restaurantId), db.list(restaurantId), readPublicMenu(restaurantId)]);
    const dishes = (menu?.categories ?? []).flatMap((c) => c.items).map((i) => ({ id: i.id, name: i.name }));
    const [orderable, dishNames, firstNames, counts] = await Promise.all([
      orderableFor(db, restaurantId, offers),
      db.dishNames(restaurantId, [...new Set(offers.flatMap((o) => o.menu_item_id ?? []))]),
      readFirstNames([...new Set(offers.flatMap((o) => o.published_by ?? []))]),
      readOfferCounts(restaurantId, offers.filter((o) => o.state !== "brouillon").slice(0, 30).map((o) => o.id)),
    ]);
    return NextResponse.json(
      { activated: true, canWrite: canManageEstablishment(access), today, dishes, offers: consoleOffers(offers, { today, orderable, dishNames, firstNames, counts }) },
      noStore,
    );
  } catch (e) {
    if (e instanceof OffersUnavailableError) return NextResponse.json({ activated: false, canWrite: false, today: brusselsDay(new Date()), dishes: [], offers: [] }, noStore);
    console.error(`[site-offers] restaurant=${restaurantId} liste :`, e);
    return BROKEN();
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  const action: unknown = body?.action;
  if (!restaurantId || typeof action !== "string") return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  // Écrire et publier engagent le restaurant ; arrêter et répondre se font au comptoir.
  const writes = action === "save" || action === "publish";
  if (!writes && action !== "stop" && action !== "answer") return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const guard = writes ? await requireEstablishmentManager(restaurantId) : await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;
  if (!(await siteOrdersAvailable(restaurantId))) return NOT_FOUND();
  const userId = guard.userId;
  try {
    const db = supabaseOffersDb();
    const res =
      action === "save" ? await saveDraft(db, { restaurantId, userId, id: body.id, copiedFrom: body.copiedFrom, raw: body.offer })
      : action === "publish" ? await publishOffer(db, { restaurantId, userId, id: body.id, teamConfirmed: body.teamConfirmed === true })
      : action === "stop" ? await stopOffer(db, { restaurantId, userId, id: body.id, reason: body.reason })
      : await answerOffer(db, { restaurantId, orderId: body.orderId, offerId: body.offerId, answer: body.answer });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
    const offer = "offer" in res ? (res.offer as OfferRow) : null;
    console.info(`[site-offers] restaurant=${restaurantId} user=${userId} geste=${action}${offer ? ` offre=${offer.id}` : ""}`);
    // ADR 0110 « Trace » : un seul « pas appliquée » est lu par l'équipe Boosteats, qui appelle le gérant.
    if (action === "answer" && body.answer === "pas_appliquee") console.warn(`[site-offers] offre PAS APPLIQUÉE au comptoir : restaurant=${restaurantId} offre=${String(body.offerId)} commande=${String(body.orderId)}`);
    if (action === "stop" && offer) {
      // Les articles qui l'annoncent sont retirés tout de suite ; la lecture publique les cache de toute façon.
      await stopOfferArticles(autoDeps(), { restaurantId, offerId: offer.id, userId }).catch((e) => {
        if (!(e instanceof PostsUnavailableError)) console.error(`[site-offers] restaurant=${restaurantId} offre=${offer.id} articles non rangés (ils restent cachés) :`, e);
      });
    }
    return NextResponse.json({ ok: true, ...(offer ? { id: offer.id } : {}) });
  } catch (e) {
    if (e instanceof OffersUnavailableError) return NextResponse.json({ error: e.message }, { status: 503 });
    console.error(`[site-offers] restaurant=${restaurantId} geste=${action} :`, e);
    return BROKEN();
  }
}
