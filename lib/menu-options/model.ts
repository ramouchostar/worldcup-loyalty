import type { GroupKind, OptionChoice, OptionGroup, Selection, SelectionLine } from "./types";

// La logique des options (ADR 0099) : quels groupes sont ouverts, ce qui manque, le prix, les lignes lisibles.
// PURE et déterministe : c'est ELLE qui fait foi côté serveur quand une commande arrive (le navigateur envoie
// ce que le client a choisi, jamais un prix), et la même fonction sert l'écran du client et le ticket.

/** Au-delà, un sous-groupe n'est plus ouvert : un menu composé n'a jamais besoin de plus de trois niveaux. */
export const MAX_DEPTH = 3;

const toCents = (euros: number) => Math.round(euros * 100);

export type VisibleGroup = { path: string; group: OptionGroup; depth: number };

/** Les groupes ouverts pour cette sélection, dans l'ordre d'affichage. Un sous-groupe n'existe que si son choix est pris. */
export function visibleGroups(groups: OptionGroup[], selection: Selection, prefix = "", depth = 0, out: VisibleGroup[] = []): VisibleGroup[] {
  for (const group of groups) {
    const path = prefix + group.id;
    out.push({ path, group, depth });
    for (const choice of group.choices) {
      if (choice.groups.length > 0 && (selection[path]?.[choice.id] ?? 0) > 0 && depth < MAX_DEPTH) {
        visibleGroups(choice.groups, selection, `${path}>${choice.id}>`, depth + 1, out);
      }
    }
  }
  return out;
}

/** La sélection de départ : les choix cochés d'office, y compris dans les sous-groupes qu'ils ouvrent. */
export function defaultSelection(groups: OptionGroup[]): Selection {
  const selection: Selection = {};
  const seen = new Set<string>();
  for (let guard = 0; guard <= MAX_DEPTH + 1; guard++) {
    let changed = false;
    for (const v of visibleGroups(groups, selection)) {
      if (seen.has(v.path)) continue;
      seen.add(v.path);
      changed = true;
      selection[v.path] = selection[v.path] ?? {};
      for (const c of v.group.choices) if (c.isDefault && c.isAvailable) selection[v.path][c.id] = 1;
    }
    if (!changed) break;
  }
  return selection;
}

export type SelectionErrorCode = "forme" | "groupe_inconnu" | "choix_inconnu" | "indisponible" | "quantite" | "minimum" | "maximum";
export type SelectionError = { path: string; title: string; code: SelectionErrorCode; message: string };

const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);

/**
 * Vérifie ce que le client envoie. Chaque erreur dit quel groupe et pourquoi, dans une phrase qu'on peut lui montrer.
 * Rien de ce que le navigateur dit n'est cru : groupes inconnus, quantités négatives, choix en rupture, minimum et
 * maximum, quantité par option.
 */
export function validateSelection(groups: OptionGroup[], selection: unknown): { ok: boolean; errors: SelectionError[] } {
  const errors: SelectionError[] = [];
  if (typeof selection !== "object" || selection === null || Array.isArray(selection)) {
    return { ok: false, errors: [{ path: "", title: "", code: "forme", message: "Ta sélection n'a pas pu être lue." }] };
  }
  const sel = selection as Selection;
  const visible = visibleGroups(groups, sel);
  const known = new Set(visible.map((v) => v.path));

  for (const path of Object.keys(sel)) {
    if (!known.has(path)) errors.push({ path, title: path, code: "groupe_inconnu", message: "Une option ne correspond plus à cet article. Recharge la page." });
  }
  for (const v of visible) {
    const picked = sel[v.path] ?? {};
    const byId = new Map(v.group.choices.map((c) => [c.id, c]));
    let total = 0;
    for (const [id, n] of Object.entries(picked)) {
      if (typeof n !== "number" || !Number.isInteger(n) || n < 0) {
        errors.push({ path: v.path, title: v.group.title, code: "forme", message: `${v.group.title} : une quantité n'est pas valide.` });
        continue;
      }
      if (n === 0) continue;
      const choice = byId.get(id);
      if (!choice) {
        errors.push({ path: v.path, title: v.group.title, code: "choix_inconnu", message: `${v.group.title} : un choix n'existe plus.` });
        continue;
      }
      if (!choice.isAvailable) errors.push({ path: v.path, title: v.group.title, code: "indisponible", message: `${v.group.title} : « ${choice.name} » n'est plus disponible.` });
      if (n > choice.maxQty) {
        errors.push({ path: v.path, title: v.group.title, code: "quantite", message: `${v.group.title} : « ${choice.name} » au plus ${choice.maxQty} ${plural(choice.maxQty, "fois", "fois")}.` });
      }
      total += n;
    }
    if (total < v.group.min) {
      errors.push({ path: v.path, title: v.group.title, code: "minimum", message: `${v.group.title} : choisis au moins ${v.group.min}.` });
    }
    if (v.group.max !== null && total > v.group.max) {
      errors.push({ path: v.path, title: v.group.title, code: "maximum", message: `${v.group.title} : choisis ${v.group.max} au plus.` });
    }
  }
  return { ok: errors.length === 0, errors };
}

/** Les groupes obligatoires encore vides, pour dire « il manque : Boisson » au client. */
export function missingGroups(groups: OptionGroup[], selection: Selection): string[] {
  return visibleGroups(groups, selection)
    .filter((v) => Object.values(selection[v.path] ?? {}).reduce((a, b) => a + b, 0) < v.group.min)
    .map((v) => v.group.title);
}

/** Le prix d'une ligne en centimes : prix de l'article plus les suppléments choisis. Supposé valide (voir validateSelection). */
export function priceCents(baseEuros: number, groups: OptionGroup[], selection: Selection): number {
  let total = toCents(baseEuros);
  for (const v of visibleGroups(groups, selection)) {
    const picked = selection[v.path] ?? {};
    for (const c of v.group.choices) total += toCents(c.priceDelta) * (picked[c.id] ?? 0);
  }
  return total;
}

/**
 * Ce que le client a choisi, en lignes lisibles et dans l'ordre : un « retrait » devient « sans X », et un groupe
 * « inclus » dont des choix sont cochés d'office (les crudités) dit « sans X » pour chaque choix décoché.
 */
export function describeSelection(groups: OptionGroup[], selection: Selection): SelectionLine[] {
  const lines: SelectionLine[] = [];
  for (const v of visibleGroups(groups, selection)) {
    const picked = selection[v.path] ?? {};
    const hasDefaults = v.group.kind === "inclus" && v.group.choices.some((c) => c.isDefault);
    for (const c of v.group.choices) {
      const n = picked[c.id] ?? 0;
      if (v.group.kind === "retrait") {
        if (n > 0) lines.push({ kind: "sans", group: v.group.title, name: c.name, qty: 1, cents: 0 });
        continue;
      }
      if (n > 0) lines.push({ kind: v.group.kind === "extra" ? "extra" : "inclus", group: v.group.title, name: c.name, qty: n, cents: toCents(c.priceDelta) * n });
      else if (hasDefaults && c.isDefault) lines.push({ kind: "sans", group: v.group.title, name: c.name, qty: 1, cents: 0 });
    }
  }
  return lines;
}

// ─── L'éditeur : la structure est-elle cohérente ? ───────────────────────────

export type TreeIssue = { groupId: string; title: string; level: "erreur" | "avertissement"; code: string; message: string };

/** Combien de choix au total un groupe peut recevoir (les quantités comptent). */
export const capacity = (group: OptionGroup) => group.choices.filter((c) => c.isAvailable).reduce((n, c) => n + c.maxQty, 0);

/**
 * Contrôle d'un arbre d'options avant enregistrement ou avant de passer en ligne : bornes, sortes de groupes,
 * choix cochés d'office, profondeur et boucles. Une erreur bloque, un avertissement se lit sur le tableau à vérifier.
 */
export function validateTree(groups: OptionGroup[], ancestors: string[] = [], depth = 0): TreeIssue[] {
  const issues: TreeIssue[] = [];
  const push = (g: OptionGroup, level: TreeIssue["level"], code: string, message: string) => issues.push({ groupId: g.id, title: g.title, level, code, message });

  for (const g of groups) {
    if (ancestors.includes(g.id)) {
      push(g, "erreur", "boucle", `« ${g.title} » se contient lui-même.`);
      continue;
    }
    if (depth > MAX_DEPTH) {
      push(g, "erreur", "profondeur", `« ${g.title} » est trop profond (${MAX_DEPTH} niveaux au plus).`);
      continue;
    }
    if (g.choices.length === 0) push(g, "erreur", "vide", `« ${g.title} » n'a aucun choix.`);
    if (!Number.isInteger(g.min) || g.min < 0) push(g, "erreur", "minimum", `« ${g.title} » : le minimum doit être 0 ou plus.`);
    if (g.max !== null && (!Number.isInteger(g.max) || g.max < 1)) push(g, "erreur", "maximum", `« ${g.title} » : le maximum doit être 1 ou plus, ou vide pour « sans limite ».`);
    if (g.max !== null && g.max < g.min) push(g, "erreur", "bornes", `« ${g.title} » : le maximum est plus petit que le minimum.`);
    if (g.min > capacity(g)) push(g, "erreur", "impossible", `« ${g.title} » demande ${g.min} choix, mais il n'en offre que ${capacity(g)}.`);

    if (g.kind === "variante" && !(g.min >= 1 && g.max === 1)) push(g, "avertissement", "variante", `« ${g.title} » est une variante : un seul choix, obligatoire.`);
    if (g.kind === "retrait") {
      if (g.choices.some((c) => c.priceDelta !== 0)) push(g, "erreur", "retrait_payant", `« ${g.title} » : retirer un ingrédient ne coûte rien.`);
      if (g.choices.some((c) => c.groups.length > 0)) push(g, "erreur", "retrait_sous_groupe", `« ${g.title} » : un retrait n'ouvre pas d'autres choix.`);
    }
    if (g.kind === "inclus" && g.choices.some((c) => c.priceDelta > 0)) push(g, "avertissement", "inclus_payant", `« ${g.title} » est compris dans le prix, mais un choix a un supplément : variante ou extra ?`);
    if (g.kind === "extra" && g.choices.length > 0 && g.choices.every((c) => c.priceDelta === 0)) push(g, "avertissement", "extra_gratuit", `« ${g.title} » est un extra payant, mais aucun choix n'a de prix.`);

    const defaults = g.choices.filter((c) => c.isDefault);
    if (g.max !== null && defaults.length > g.max) push(g, "erreur", "defauts", `« ${g.title} » : ${defaults.length} choix cochés d'office pour ${g.max} au plus.`);
    if (defaults.some((c) => !c.isAvailable)) push(g, "avertissement", "defaut_indisponible", `« ${g.title} » : un choix coché d'office est en rupture.`);

    for (const c of g.choices) {
      if (!(c.priceDelta >= 0)) push(g, "erreur", "prix", `« ${g.title} » : « ${c.name} » a un prix négatif.`);
      if (!Number.isInteger(c.maxQty) || c.maxQty < 1) push(g, "erreur", "quantite", `« ${g.title} » : « ${c.name} » doit pouvoir être pris au moins une fois.`);
      if (c.groups.length > 0) issues.push(...validateTree(c.groups, [...ancestors, g.id], depth + 1));
    }
  }
  return issues;
}

// ─── À partir de données lues (import) : de quelle sorte est ce groupe ? ───

const RETRAIT_TITLE = /\bsans\b|retir|without|enlev|\bno\b/i;
const RETRAIT_NAME = /^\s*(sans|without|no|pas de|geen)\s+\S/i;

/**
 * Devine la sorte d'un groupe à partir de ce qu'on a lu (titre, bornes, prix). Une proposition : le restaurateur la
 * corrige au tableau à vérifier. Règles : « sans … » est un retrait ; tout à 0 € est compris ; tout payant est un
 * extra ; un mélange obligatoire à un seul choix est une variante (taille), sinon un extra.
 */
export function classifyKind(draft: { title: string; min: number; max: number | null; choices: { name: string; priceDelta: number }[] }): GroupKind {
  const { title, choices } = draft;
  if (choices.length > 0 && (RETRAIT_TITLE.test(title) || choices.every((c) => RETRAIT_NAME.test(c.name))) && choices.every((c) => c.priceDelta === 0)) return "retrait";
  const paid = choices.filter((c) => c.priceDelta > 0).length;
  if (paid === 0) return "inclus";
  if (paid === choices.length) return "extra";
  return draft.min >= 1 && draft.max === 1 ? "variante" : "extra";
}

export type { GroupKind, OptionChoice, OptionGroup, Selection, SelectionLine };
