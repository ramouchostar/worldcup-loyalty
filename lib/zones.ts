// ADR 0018 — Zones du membre (texte libre, maille ville/quartier comme le
// sector des établissements, ADR 0016). Fonctions pures, importables côté
// client (validation du formulaire) comme côté serveur.

export const MAX_ZONES = 3;
export const ZONE_MIN_LEN = 2;
export const ZONE_MAX_LEN = 40;

// Trim + espaces réduits ; renvoie "" si hors bornes.
export function normalizeZone(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const clean = raw.trim().replace(/\s+/g, " ");
  if (clean.length < ZONE_MIN_LEN || clean.length > ZONE_MAX_LEN) return "";
  return clean;
}

// Clé de correspondance : insensible à la casse et aux accents
// ("Molenbeek" ≡ "molenbeek" ≡ "MOLENBEEK").
export function zoneKey(zone: string): string {
  return zone
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

// Liste saisie par le membre → zones valides, dédupliquées, max 3.
export function sanitizeZones(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    const zone = normalizeZone(raw);
    if (!zone) continue;
    const key = zoneKey(zone);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(zone);
    if (out.length >= MAX_ZONES) break;
  }
  return out;
}

export function zonesMatch(a: string, b: string): boolean {
  return zoneKey(a) === zoneKey(b);
}
