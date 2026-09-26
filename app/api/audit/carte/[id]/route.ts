import { NextResponse } from "next/server";
import { getAudit } from "@/lib/audit/store";
import { distanceM } from "@/lib/audit/competitors";
import { isValidFrame, MAP_SIZE } from "@/lib/audit/neighbors-map";

// ADR 0069 §3 C — fond de carte « Face aux voisins » (Google Static Maps).
// La clé reste sur le serveur : le navigateur ne voit que cette route.
// Publique (le rapport partagé l'affiche), mais bornée : le cadre demandé doit
// être centré à moins de 3 km du restaurant audité, zoom entier 13 à 16 —
// impossible de s'en servir comme fond de carte gratuit ailleurs.
// Échec → 502 avec le motif : le composant bascule sur OpenStreetMap et la
// console affiche « fond Google indisponible » (jamais d'échec silencieux).

const MAX_OFFSET_M = 3000;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const [lat, lng] = (url.searchParams.get("c") ?? "").split(",").map(Number);
  const frame = { lat, lng, zoom: Number(url.searchParams.get("z")) };
  if (!isValidFrame(frame)) return NextResponse.json({ error: "Cadre invalide." }, { status: 400 });

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return NextResponse.json({ error: "Source non branchée : GOOGLE_PLACES_API_KEY absente." }, { status: 502 });

  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Audit inconnu." }, { status: 404 });
  const data = await getAudit(id).catch(() => null);
  const info = data?.sections.find((s) => s.section === "fiche" && s.status === "ok")?.raw as { latitude?: number | null; longitude?: number | null } | undefined;
  if (info?.latitude == null || info?.longitude == null) return NextResponse.json({ error: "Audit sans position." }, { status: 404 });
  if (distanceM({ lat: info.latitude, lng: info.longitude }, frame) > MAX_OFFSET_M) {
    return NextResponse.json({ error: "Cadre trop loin du restaurant." }, { status: 400 });
  }

  const q = new URLSearchParams({
    center: `${frame.lat},${frame.lng}`,
    zoom: String(frame.zoom),
    size: `${MAP_SIZE}x${MAP_SIZE}`,
    scale: "2",
    language: "fr",
    region: "BE",
    key,
  });
  // Fond sobre : on masque les commerces et arrêts de Google, nos épingles
  // sont les seules à parler.
  for (const style of ["feature:poi|visibility:off", "feature:transit|visibility:off", "feature:road|element:labels.icon|visibility:off"]) q.append("style", style);

  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/staticmap?${q}`, { signal: AbortSignal.timeout(8000) });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) {
      const motif = `${res.status} ${(await res.text()).slice(0, 200)}`;
      console.error("[audit/carte] Google Static Maps a refusé :", motif);
      return NextResponse.json({ error: `Google Static Maps : ${motif}` }, { status: 502 });
    }
    return new NextResponse(await res.arrayBuffer(), {
      headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400, s-maxage=86400" },
    });
  } catch (e) {
    const motif = e instanceof Error ? e.message : String(e);
    console.error("[audit/carte] Google Static Maps injoignable :", motif);
    return NextResponse.json({ error: `Google Static Maps injoignable : ${motif}` }, { status: 502 });
  }
}
