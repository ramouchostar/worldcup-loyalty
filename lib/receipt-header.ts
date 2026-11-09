// ============================================================
// L'en-tête imprimé décide de l'établissement (ADR 0091, amende l'ADR 0073) — pur, testé.
//
// Le code au milieu de la clé (223, 258…) ne sert plus de preuve d'identité :
// un chiffre mal lu change de restaurant. Ce qui est imprimé en haut du ticket
// (nom + adresse) est plus parlant. On compare ce que le modèle a LU (sans lui
// souffler le nom du restaurant) à l'identité enregistrée de chaque établissement.
//
// Prudence : un en-tête n'est lu que sur ~54 % des tickets (mesure sur 30 jours), donc
//  - absent, illisible ou ambigu → verdict « inconnu » : on retombe sur le code de la clé ;
//  - seul un en-tête qui désigne CLAIREMENT un autre établissement refuse le ticket.
// ============================================================

export type EstablishmentIdentity = {
  id: string;
  name: string;
  address: string | null;
  /** Établissement actif dans le programme ; false = en attente ou désactivé (ADR 0098). Absent = actif. */
  active?: boolean;
};

export type HeaderVerdict = "own" | "other" | "unknown";

// Mots sans valeur d'identité : voirie, articles, ville.
const STOP = new Set([
  "de", "du", "des", "la", "le", "les", "van", "der", "den", "het", "op", "d", "l",
  "av", "ave", "avenue", "rue", "chaussee", "chau", "chaus", "bd", "boulevard", "place", "pl",
  "laan", "straat", "steenweg", "plein", "weg",
  "bruxelles", "brussel", "brussels", "belgique", "belgie", "belgium",
]);

function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(text: string): string[] {
  return fold(text)
    .split(" ")
    .filter((t) => t.length > 0 && !STOP.has(t));
}

/** « kraainemlaan » et « kraainem » désignent la même rue ; « bue » et « bu » non (5 lettres mini). */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 5 && long.startsWith(short);
}

function hasWord(words: string[], word: string): boolean {
  return words.some((w) => sameWord(w, word));
}

/** Numéro de rue : le premier groupe de chiffres de l'adresse (« Rue Xavier De Bue 47 » → 47). */
function streetNumber(address: string): string | null {
  const m = fold(address).match(/\b(\d{1,4})\b/);
  return m ? m[1] : null;
}

/**
 * Mots qui distinguent un établissement des autres : ceux de son nom qui ne sont pas communs à
 * tous les noms (la marque « Belchicken ») ni de la liste des mots vides.
 */
function distinctiveNameWords(identity: EstablishmentIdentity, all: readonly EstablishmentIdentity[]): string[] {
  const mine = tokens(identity.name);
  const others = all.filter((o) => o.id !== identity.id).map((o) => tokens(o.name));
  return mine.filter((w) => !others.every((o) => hasWord(o, w)));
}

/** L'en-tête lu désigne-t-il cet établissement ? Nom distinctif OU (numéro + mot de rue). */
export function headerMatches(
  printedName: string | null,
  printedAddress: string | null,
  identity: EstablishmentIdentity,
  all: readonly EstablishmentIdentity[]
): boolean {
  if (printedName) {
    const wanted = distinctiveNameWords(identity, all);
    const seen = tokens(printedName);
    if (wanted.length > 0 && wanted.every((w) => hasWord(seen, w))) return true;
  }
  if (printedAddress && identity.address) {
    const number = streetNumber(identity.address);
    const printedNumber = streetNumber(printedAddress);
    const street = tokens(identity.address).filter((w) => !/^\d+$/.test(w));
    const seen = tokens(printedAddress);
    const sharesStreet = street.some((w) => w.length >= 4 && hasWord(seen, w));
    if (number && printedNumber === number && sharesStreet) return true;
  }
  return false;
}

/**
 * Verdict de l'en-tête :
 *  - `own`     : il ne désigne que l'établissement du client ;
 *  - `other`   : il ne désigne qu'un AUTRE établissement ;
 *  - `unknown` : absent, illisible, ambigu (désigne plusieurs établissements) ou inconnu de nous.
 */
export function judgeHeader(
  printedName: string | null,
  printedAddress: string | null,
  ownId: string,
  identities: readonly EstablishmentIdentity[]
): { verdict: HeaderVerdict; matched: string | null } {
  if (!printedName && !printedAddress) return { verdict: "unknown", matched: null };
  const hits = identities.filter((i) => headerMatches(printedName, printedAddress, i, identities));
  if (hits.length !== 1) return { verdict: "unknown", matched: null };
  return { verdict: hits[0].id === ownId ? "own" : "other", matched: hits[0].id };
}
