// ADR 0068 §2 — l'audit est limité aux 19 communes de la Région de Bruxelles-Capitale.
// Contrôlé côté serveur sur le code postal renvoyé par la source, jamais
// seulement dans le navigateur.

export const BRUSSELS_POSTAL_CODES: Record<string, string> = {
  "1000": "Bruxelles",
  "1020": "Laeken",
  "1030": "Schaerbeek",
  "1040": "Etterbeek",
  "1050": "Ixelles",
  "1060": "Saint-Gilles",
  "1070": "Anderlecht",
  "1080": "Molenbeek-Saint-Jean",
  "1081": "Koekelberg",
  "1082": "Berchem-Sainte-Agathe",
  "1083": "Ganshoren",
  "1090": "Jette",
  "1120": "Neder-Over-Heembeek",
  "1130": "Haren",
  "1140": "Evere",
  "1150": "Woluwe-Saint-Pierre",
  "1160": "Auderghem",
  "1170": "Watermael-Boitsfort",
  "1180": "Uccle",
  "1190": "Forest",
  "1200": "Woluwe-Saint-Lambert",
  "1210": "Saint-Josse-ten-Noode",
};

export function isBrussels(postalCode: string | null | undefined): boolean {
  return !!postalCode && postalCode.trim() in BRUSSELS_POSTAL_CODES;
}

/** Dernier code postal belge à 4 chiffres d'une adresse libre (« Rue X 1, 1050 Ixelles »). */
export function postalCodeOf(address: string | null | undefined): string | null {
  const all = address?.match(/\b1\d{3}\b/g);
  return all ? all[all.length - 1] : null;
}
