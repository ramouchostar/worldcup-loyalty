import { createAdminClient } from "./supabase";

// ADR 0037 — Entonnoir d'acquisition, mesuré côté serveur.
//
// Quatre étages, quatre sources déjà en base sauf la première :
//   1. atterrissage  → `qr_landings` (m60, ce fichier)
//   2. inscription   → `memberships.joined_at`
//   3. scan de ticket→ `receipt_scans.scanned_at` (ADR 0036)
//   4. commande      → `orders.submitted_at`
//
// Aucune donnée personnelle au premier étage : ni IP, ni agent utilisateur,
// ni cookie, ni identifiant — un compteur par jour. C'est ce qui permet de
// mesurer sans consentement (ADR 0025), là où GA4 ne voit presque rien.

export type LandingSource = "qr_code" | "direct";
export type LandingVisitor = "anonyme" | "membre";

// Jour belge : un scan au comptoir appartient à la journée du commerce, pas
// à une date UTC (même raisonnement que currentMonthInBrussels, lib/scan-meter).
export function todayInBrussels(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" });
}

/**
 * Compte une arrivée sur la page d'un établissement.
 * Best-effort : jamais propagé — une panne de comptage ne doit pas empêcher
 * la page de s'afficher.
 */
export async function recordLanding(
  restaurantId: string,
  source: LandingSource,
  visitor: LandingVisitor
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.rpc("record_landing", {
      p_restaurant_id: restaurantId,
      p_day: todayInBrussels(),
      p_source: source,
      p_visitor: visitor,
    });
    if (error) throw error;
  } catch (e) {
    // m60 pas encore appliquée / panne — la page s'affiche sans compter.
    console.error("[qr-funnel] recordLanding failed:", (e as Error).message);
  }
}

export type FunnelDay = {
  day: string;
  landingsQr: number;      // arrivées anonymes venues d'un QR imprimé
  landingsDirect: number;  // arrivées anonymes sans utm (lien partagé, saisie)
  landingsMembre: number;  // retours de membres déjà inscrits
  signups: number;
  scans: number;
  orders: number;
};

/**
 * Entonnoir jour par jour, du plus récent au plus ancien.
 * Les étages 2 à 4 remontent même sans m60 : l'absence de comptage
 * d'atterrissages ne doit pas priver de ce qu'on sait déjà.
 */
export async function getFunnel(restaurantId: string, days = 14): Promise<FunnelDay[]> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - days * 86400_000);
  const sinceDay = since.toISOString().slice(0, 10);

  const [landings, memberships, scans, orders] = await Promise.all([
    admin.from("qr_landings").select("day, source, visitor, count").eq("restaurant_id", restaurantId).gte("day", sinceDay),
    admin.from("memberships").select("joined_at").eq("restaurant_id", restaurantId).gte("joined_at", since.toISOString()),
    admin.from("receipt_scans").select("scanned_at").eq("restaurant_id", restaurantId).gte("scanned_at", since.toISOString()),
    admin.from("orders").select("submitted_at").eq("restaurant_id", restaurantId).gte("submitted_at", since.toISOString()),
  ]);

  const parJour = new Map<string, FunnelDay>();
  const jour = (d: string): FunnelDay => {
    const key = d.slice(0, 10);
    let row = parJour.get(key);
    if (!row) {
      row = { day: key, landingsQr: 0, landingsDirect: 0, landingsMembre: 0, signups: 0, scans: 0, orders: 0 };
      parJour.set(key, row);
    }
    return row;
  };

  for (const l of (landings.data ?? []) as { day: string; source: string; visitor: string; count: number }[]) {
    const row = jour(l.day);
    if (l.visitor === "membre") row.landingsMembre += l.count;
    else if (l.source === "qr_code") row.landingsQr += l.count;
    else row.landingsDirect += l.count;
  }
  for (const m of (memberships.data ?? []) as { joined_at: string }[]) jour(m.joined_at).signups++;
  for (const s of (scans.data ?? []) as { scanned_at: string }[]) jour(s.scanned_at).scans++;
  for (const o of (orders.data ?? []) as { submitted_at: string }[]) jour(o.submitted_at).orders++;

  return [...parJour.values()].sort((a, b) => b.day.localeCompare(a.day));
}
