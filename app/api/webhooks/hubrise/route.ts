import { NextResponse } from "next/server";
import { hubriseCredentials } from "@/lib/hubrise/api";
import { toStoredOrder, verifyCallbackSignature, type HubriseOrder } from "@/lib/hubrise/model";
import { connectionByLocation, journal, upsertOrders } from "@/lib/hubrise/store";

// ADR 0102 §2 — rappel HubRise : une commande créée ou modifiée. Signé
// HMAC-SHA256 avec le secret client (en-tête X-HubRise-Hmac-SHA256) ; sans
// signature valide, rien n'est écrit. HubRise attend une réponse 200-499 en
// moins de 20 s, sinon il renvoie l'événement (6 fois au plus) : un 5xx ne sert
// qu'à une panne réelle de notre côté, que la relecture de nuit rattrape aussi.

type OrderEvent = {
  id?: string;
  resource_type?: string;
  event_type?: string;
  location_id?: string;
  order_id?: string;
  new_state?: HubriseOrder;
};

export async function POST(request: Request) {
  const cred = hubriseCredentials();
  if (!cred) return NextResponse.json({ error: "HubRise non configuré." }, { status: 503 });

  const body = await request.text();
  if (!verifyCallbackSignature(body, request.headers.get("x-hubrise-hmac-sha256"), cred.clientSecret)) {
    console.warn("[webhook hubrise] signature refusée");
    await journal("callback_refused", { reason: "signature" });
    return NextResponse.json({ error: "Signature invalide." }, { status: 401 });
  }

  let event: OrderEvent;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Corps illisible." }, { status: 400 });
  }
  // Seules les commandes sont demandées au rappel ; tout le reste est accusé.
  if (event.resource_type !== "order" || !event.location_id) return NextResponse.json({ ok: true, ignored: true });

  const conn = await connectionByLocation(event.location_id);
  if (!conn) {
    // Point de vente déconnecté chez nous mais rappel encore posé chez HubRise.
    await journal("callback_unknown_location", { location_id: event.location_id, event_id: event.id ?? null });
    return NextResponse.json({ ok: true, ignored: true });
  }

  const stored = event.new_state ? toStoredOrder({ ...event.new_state, location_id: event.location_id }) : null;
  if (!stored) {
    await journal("callback_unreadable", { event_id: event.id ?? null, order_id: event.order_id ?? null }, conn.id);
    return NextResponse.json({ ok: true, ignored: true });
  }
  try {
    await upsertOrders(conn, [stored], "callback");
  } catch (e) {
    console.error("[webhook hubrise]", (e as Error).message);
    return NextResponse.json({ error: "Enregistrement impossible." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
