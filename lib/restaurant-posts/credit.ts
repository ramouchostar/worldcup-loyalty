// ADR 0112 §9 — la mention écrite sous un article d'occasion, et les liens qu'elle doit porter. Le texte gardé avec
// l'article n'a ni adresse ni code : les liens sont posés à l'affichage, d'après cette liste fermée. PUR, testé.

/** MET Norway (CC BY 4.0) demande : le crédit, un lien vers la licence, et dire que les données ont été changées. */
export const WEATHER_CREDIT =
  "Texte composé par Boosteats d'après les prévisions de MET Norway, résumées en quelques phrases. Licence CC BY 4.0.";

export const CREDIT_LINKS: Record<string, string> = {
  "MET Norway": "https://www.met.no/en",
  "CC BY 4.0": "https://creativecommons.org/licenses/by/4.0/",
};

export type CreditPart = { text: string; href: string | null };

/** La mention découpée : les noms connus deviennent des liens, le reste est du texte. */
export function creditParts(credit: string): CreditPart[] {
  const names = Object.keys(CREDIT_LINKS);
  const out: CreditPart[] = [];
  let rest = credit;
  while (rest !== "") {
    const next = names
      .map((name) => ({ name, at: rest.indexOf(name) }))
      .filter((n) => n.at >= 0)
      .sort((a, b) => a.at - b.at)[0];
    if (!next) {
      out.push({ text: rest, href: null });
      break;
    }
    if (next.at > 0) out.push({ text: rest.slice(0, next.at), href: null });
    out.push({ text: next.name, href: CREDIT_LINKS[next.name] });
    rest = rest.slice(next.at + next.name.length);
  }
  return out;
}
