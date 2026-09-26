import { NextResponse, after } from "next/server";
import { isPlacesConfigured, placeDetails } from "@/lib/audit/places";
import { isBrussels, postalCodeOf } from "@/lib/audit/brussels";
import { clientIp, createLead, ipHash, LeadsUnavailable, quota, recentScan } from "@/lib/audit/leads";
import { runQuickScan } from "@/lib/audit/quick-scan";

// ADR 0071 — lance le score rapide d'un établissement choisi dans les suggestions.
// Contrôles serveur : table présente (fail-closed), plafonds, Bruxelles sur le
// code postal RÉEL de la fiche, réutilisation d'un score de moins de 24 h.
export const dynamic = "force-dynamic";
// Le score rapide tourne en tâche de fond après la réponse : il hérite de cette durée.
export const maxDuration = 120;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { placeId?: string; session?: string } | null;
  const placeId = String(body?.placeId ?? "").slice(0, 300);
  const session = String(body?.session ?? "").slice(0, 64);
  if (!placeId) return NextResponse.json({ error: "fiche_manquante" }, { status: 400 });
  if (!isPlacesConfigured()) return NextResponse.json({ error: "indisponible" }, { status: 503 });

  const ip = clientIp(req.headers);
  try {
    const q = await quota(ip);
    if (!q.ok) return NextResponse.json({ error: q.reason === "ip" ? "plafond_ip" : "plafond_jour" }, { status: 429 });

    // Même fiche analysée il y a moins de 24 h : on repart de ce score, sans appel payant.
    const recent = await recentScan(placeId);
    if (recent) {
      const copy = await createLead({
        place_id: recent.place_id,
        name: recent.name,
        address: recent.address,
        postal_code: recent.postal_code,
        in_brussels: recent.in_brussels,
        scan_status: recent.scan_status,
        scan: recent.scan,
        score: recent.score,
        ip_hash: ipHash(ip),
        calls: { reutilise: 1 },
      });
      return NextResponse.json({ id: copy.id });
    }

    const d = await placeDetails(placeId, /^[\w-]{8,64}$/.test(session) ? session : null);
    const postal = d.postalCode ?? postalCodeOf(d.address);
    const inBrussels = isBrussels(postal);
    const lead = await createLead({
      place_id: d.id,
      name: d.name,
      address: d.address,
      postal_code: postal,
      in_brussels: inBrussels,
      scan_status: inBrussels ? "en_cours" : "hors_zone",
      scan: inBrussels ? {} : { place: { name: d.name, address: d.address, category: d.category, rating: d.rating, reviewsCount: d.reviewsCount, phone: !!d.phone, website: d.website, openNow: d.openNow, hasHours: d.hasHours, orderButton: null, totalPhotos: null } },
      ip_hash: ipHash(ip),
      cost_usd: 0.025,
      calls: { places_details: 1 },
    });
    if (inBrussels) after(() => runQuickScan(lead.id, d));
    return NextResponse.json({ id: lead.id });
  } catch (e) {
    if (e instanceof LeadsUnavailable) return NextResponse.json({ error: "indisponible" }, { status: 503 });
    console.error("[audit-gratuit] lancement :", e);
    return NextResponse.json({ error: "echec" }, { status: 502 });
  }
}
