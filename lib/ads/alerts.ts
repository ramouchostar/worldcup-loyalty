import { createAdminClient } from "../supabase";
import { dispatch } from "../email";
import { getRestaurantContactEmail } from "../missions-contact";
import { pubAlertEmail, pubUpdateEmail, type PubRow } from "../email-templates/pub";
import { pubConfig } from "./config";

// ADR 0086 §2 — « Aucune attente sans e-mail, aucun e-mail sans ligne au journal. »
// Tout passe par `dispatch` (journal message_sends). `ad_alerts` empêche d'envoyer la même
// alerte deux fois le même jour (une relance par jour au plus) ; sans la table, on envoie
// quand même : un doublon vaut mieux qu'une attente oubliée.

async function alreadySent(kind: string, ref: string, to: string): Promise<boolean> {
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" });
  const { data, error } = await createAdminClient().from("ad_alerts").select("id").eq("kind", kind).eq("ref", ref).eq("day", day).eq("sent_to", to).limit(1);
  if (error) return false;
  return (data ?? []).length > 0;
}

async function remember(kind: string, ref: string, to: string, ok: boolean): Promise<void> {
  const { error } = await createAdminClient().from("ad_alerts").insert({ kind, ref, sent_to: to, ok });
  if (error && error.code !== "23505") console.error("[ads/alerts] ad_alerts:", error.message);
}

/** Alerte à Mehdi. `once` : une seule fois par jour pour ce (kind, ref). */
export async function alertPlatform(kind: string, ref: string, p: { subject: string; title: string; lines: string[]; rows?: PubRow[] }, once = true): Promise<boolean> {
  const to = pubConfig().alertEmail;
  if (!to) {
    console.error(`[ads/alerts] PUB_ALERT_EMAIL absent : alerte « ${kind} » (${ref}) non envoyée`);
    return false;
  }
  if (once && (await alreadySent(kind, ref, to))) return true;
  const ok = await dispatch(to, pubAlertEmail(p), { key: "pub_alert", audience: "restaurant", restaurantId: null });
  await remember(kind, ref, to, ok);
  return ok;
}

/** E-mail au restaurateur qui a fait la demande (sinon au propriétaire). */
export async function notifyRestaurant(
  kind: string,
  ref: string,
  r: { restaurantId: string; restaurantName: string; requestedBy: string | null },
  p: { subject: string; title: string; intro: string; rows?: PubRow[]; note?: string },
  once = true
): Promise<boolean> {
  const to = await getRestaurantContactEmail(r.restaurantId, r.requestedBy);
  if (!to) {
    // Personne à prévenir : la plateforme le sait (ADR 0065, jamais un e-mail perdu en silence).
    await alertPlatform(`no_contact_${kind}`, ref, { subject: `Pub — ${r.restaurantName} : aucune adresse à prévenir`, title: "Restaurateur sans adresse e-mail", lines: [`L'e-mail « ${p.subject} » n'a pas pu partir : aucune adresse pour ${r.restaurantName}.`] });
    return false;
  }
  if (once && (await alreadySent(kind, ref, to))) return true;
  const ok = await dispatch(to, pubUpdateEmail({ restaurantName: r.restaurantName, restaurantId: r.restaurantId, ...p }), {
    key: "pub_update",
    audience: "restaurant",
    restaurantId: r.restaurantId,
    userId: r.requestedBy,
  });
  await remember(kind, ref, to, ok);
  return ok;
}
