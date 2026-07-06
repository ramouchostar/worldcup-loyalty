// ADR 0020 — Rapprochement des libellés de ticket vers le catalogue.
// Matching par égalité stricte sur nom normalisé (pas de fuzzy au MVP) :
// un faux positif polluerait les stats resto, un raté laisse simplement
// menu_item_id à NULL.

export function normalizeItemName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // retire les accents combinants
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function buildMenuMatcher(
  items: { id: string; name: string }[]
): (rawName: string) => string | null {
  const byNormalized = new Map<string, string>();
  for (const item of items) {
    const key = normalizeItemName(item.name);
    if (key !== "" && !byNormalized.has(key)) byNormalized.set(key, item.id);
  }
  return (rawName: string) => byNormalized.get(normalizeItemName(rawName)) ?? null;
}
