import { NextResponse } from "next/server";
import { isPlacesConfigured, placeForSignup } from "@/lib/audit/places";
import { clientIp, ipHash, uuidFromHash } from "@/lib/audit/leads";
import { checkRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase";
import { cuisineFromCategory, type PlacePrefill } from "@/lib/partner-draft";

// ADR 0075 §1 et §7 — la fiche Google qui pré-remplit un établissement, et si
// elle est déjà inscrite (une fiche = un établissement). Public, limité par IP
// (30 fiches / 10 min) : chaque fiche est un appel Google payant.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = (url.searchParams.get("id") ?? "").slice(0, 300);
  const session = (url.searchParams.get("s") ?? "").slice(0, 64);
  if (!/^[\w-]{10,300}$/.test(id)) return NextResponse.json({ error: "fiche_invalide" }, { status: 400 });
  if (!isPlacesConfigured()) return NextResponse.json({ error: "indisponible" }, { status: 503 });

  const allowed = await checkRateLimit(uuidFromHash(ipHash(clientIp(req.headers))), "partner_place", 30, 600);
  if (!allowed) return NextResponse.json({ error: "trop_de_recherches" }, { status: 429 });

  let place;
  try {
    place = await placeForSignup(id, /^[\w-]{8,64}$/.test(session) ? session : null);
  } catch (e) {
    console.error("[inscription] fiche Google :", e);
    return NextResponse.json({ error: "indisponible" }, { status: 502 });
  }

  // Sans la colonne (migration 20261001-2321), on ne sait pas : on laisse
  // passer, la création revérifie.
  const { data: taken, error } = await createAdminClient()
    .from("restaurants")
    .select("id")
    .eq("google_place_id", place.id)
    .limit(1);
  if (error) console.error("[inscription] google_place_id illisible :", error.message);

  const prefill: PlacePrefill = {
    placeId: place.id,
    name: place.name,
    address: place.address ?? "",
    sector: place.locality ?? "",
    phone: place.phone ?? "",
    website: place.website ?? "",
    mapsUrl: place.mapsUri ?? "",
    cuisine: cuisineFromCategory(place.category),
  };
  return NextResponse.json(
    { prefill, alreadyRegistered: !error && (taken ?? []).length > 0 },
    { headers: { "Cache-Control": "no-store" } },
  );
}
