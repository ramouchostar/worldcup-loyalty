// L'adresse d'un article (ADR 0111 §1) : /commander/<établissement>/articles/<adresse>. PUR, testé.
// Un brouillon a une adresse provisoire ; la vraie est tirée du titre à la PREMIÈRE publication et ne change plus
// jamais : un lien déjà partagé reste bon, même si le titre est corrigé.

const MAX = 60;

export function slugify(title: string): string {
  const s = title
    .replace(/œ/gi, "oe")
    .replace(/æ/gi, "ae")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (s.length <= MAX) return s || "article";
  const cut = s.slice(0, MAX + 1);
  const dash = cut.lastIndexOf("-");
  return cut.slice(0, dash > MAX / 2 ? dash : MAX).replace(/-+$/, "");
}

/** La n-ième proposition quand l'adresse est déjà prise : « nouveau-menu », puis « nouveau-menu-2 »… */
export const slugCandidate = (base: string, attempt: number): string => (attempt <= 1 ? base : `${base}-${attempt}`);

/** Adresse provisoire d'un brouillon jamais publié (`random` : 32 caractères hexadécimaux ou un UUID). */
export const draftSlug = (random: string): string => `brouillon-${random.replace(/[^a-f0-9]/gi, "").slice(0, 12).toLowerCase()}`;

export const isSlug = (v: unknown): v is string => typeof v === "string" && v.length <= 80 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(v);
