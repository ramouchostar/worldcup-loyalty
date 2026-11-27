// ADR 0112 — les noms venus de tiers (événement, équipe, compétition) avant d'entrer dans une phrase : nettoyés et
// limités. Ce nettoyage ne juge pas le contenu : le contrôle de publication (check.ts) passe ensuite et peut refuser.
// PUR, testé.

/** Caractères de contrôle, de format (invisibles, sens d'écriture) et zone privée : ils cacheraient un mot au contrôle. */
const HIDDEN = /[\p{Cc}\p{Cf}\p{Co}]/gu;
/** Les guillemets : le nom est ensuite écrit entre « ». */
const QUOTES = /["“”„«»]/g;

export const NAME_MAX = 60;
export const TEAM_MAX = 30;

/** `null` : il ne reste rien d'utilisable. Trop long : coupé entre deux mots, avec « … ». */
export function cleanName(raw: unknown, max: number = NAME_MAX): string | null {
  if (typeof raw !== "string") return null;
  const s = raw
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .replace(HIDDEN, "")
    .replace(QUOTES, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\s,;:.\-–—|/]+$/, "");
  if (!/[\p{L}\p{N}]/u.test(s)) return null;
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.\-–—|/(]+$/, "")}…`;
}
