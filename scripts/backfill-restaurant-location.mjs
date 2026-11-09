// One-shot ops — pose restaurants.lat / lng depuis la fiche Google
// (google_place_id) pour les établissements qui n'ont pas de position.
// L'inscription la pose désormais elle-même (lib/partner-signup.ts,
// setLocationFromPlace) ; ce script rattrape les inscrits d'avant, et ceux
// dont la lecture a échoué (« position non posée » dans les journaux Vercel).
// Ne touche jamais une position déjà posée.
//
// Usage : node scripts/backfill-restaurant-location.mjs          (montre)
//         node scripts/backfill-restaurant-location.mjs --apply  (écrit)
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    })
);

if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class {
    constructor() {}
    close() {}
  };
}

const apply = process.argv.includes("--apply");
const placesKey = env.GOOGLE_PLACES_API_KEY;
if (!placesKey) throw new Error("GOOGLE_PLACES_API_KEY absente de .env.local");

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await admin
  .from("restaurants")
  .select("id, name, google_place_id")
  .not("google_place_id", "is", null)
  .or("lat.is.null,lng.is.null");
if (error) throw error;

let done = 0;
for (const r of data ?? []) {
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(r.google_place_id)}`, {
    headers: { "X-Goog-Api-Key": placesKey, "X-Goog-FieldMask": "location" },
  });
  if (!res.ok) {
    console.error(`✖ ${r.id} : Places ${res.status}`);
    continue;
  }
  const loc = (await res.json()).location;
  if (typeof loc?.latitude !== "number" || typeof loc?.longitude !== "number") {
    console.warn(`… ${r.id} : fiche sans position`);
    continue;
  }
  console.log(`${apply ? "✓" : "→"} ${r.id} (${r.name}) : ${loc.latitude}, ${loc.longitude}`);
  if (!apply) continue;
  const { error: e } = await admin
    .from("restaurants")
    .update({ lat: loc.latitude, lng: loc.longitude })
    .eq("id", r.id)
    .is("lat", null);
  if (e) console.error(`✖ ${r.id} : ${e.message}`);
  else done++;
}
console.log(`${data?.length ?? 0} sans position, ${apply ? `${done} posées` : "rien écrit (ajouter --apply)"}`);
