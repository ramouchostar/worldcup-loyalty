// ADR 0086 §3 — communication structurée belge d'un paiement de pub.
// Module PUR et testé. Forme : +++XXX/XXXX/XXXXX+++, 12 chiffres dont les deux
// derniers sont la clé : (10 premiers chiffres) modulo 97, 97 si le reste est 0.
//
// Les 10 chiffres = numéro du code client (3) + numéro de la demande chez ce
// client (7) : BE002, 1re demande → 002 0000001. Le préfixe pays du code
// n'y figure pas : le jour où un autre pays arrive, il prendra un premier
// chiffre réservé (ADR à part).

const CODE = /^[A-Z]{2}([0-9]{3})$/;

function checkDigits(base10: string): string {
  // 10 chiffres < 2^53 : exact en Number.
  const r = Number(base10) % 97;
  return String(r === 0 ? 97 : r).padStart(2, "0");
}

function format(digits12: string): string {
  return `+++${digits12.slice(0, 3)}/${digits12.slice(3, 7)}/${digits12.slice(7)}+++`;
}

/** La communication d'une demande : `BE002`, 1 → « +++002/0000/00156+++ ». */
export function structuredRef(clientCode: string, requestSeq: number): string {
  const m = CODE.exec(clientCode);
  if (!m) throw new Error(`code client invalide : ${clientCode}`);
  if (!Number.isInteger(requestSeq) || requestSeq < 1 || requestSeq > 9_999_999) {
    throw new RangeError(`numéro de demande hors limites : ${requestSeq}`);
  }
  const base = `${m[1]}${String(requestSeq).padStart(7, "0")}`;
  return format(base + checkDigits(base));
}

/**
 * Relit une communication telle qu'un relevé bancaire la donne (+++…+++,
 * ***…***, espaces, sans séparateurs) ; renvoie la forme canonique si la clé
 * est bonne, sinon null.
 */
export function parseStructuredRef(text: string): string | null {
  const digits = text.replace(/[+*/\s.-]/g, "");
  if (!/^[0-9]{12}$/.test(digits)) return null;
  const base = digits.slice(0, 10);
  if (checkDigits(base) !== digits.slice(10)) return null;
  return format(digits);
}

/** Retrouve le code client et le numéro de demande d'une communication valide. */
export function decodeStructuredRef(text: string, country = "BE"): { clientCode: string; requestSeq: number } | null {
  const canonical = parseStructuredRef(text);
  if (!canonical) return null;
  const digits = canonical.replace(/[^0-9]/g, "");
  return { clientCode: `${country}${digits.slice(0, 3)}`, requestSeq: Number(digits.slice(3, 10)) };
}
