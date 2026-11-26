// ADR 0108 (maquette « ordinateur, fiche d'un plat ») — la fiche d'un plat en deux colonnes. Logique PURE et testée.

import type { OptionGroup } from "../menu-options/types";

/**
 * À gauche ce qui compose le plat (taille, sauce, accompagnement), à droite ce qu'on ajoute ou retire (suppléments,
 * « sans »). Un plat qui n'a que l'un des deux se partage en deux moitiés, dans son ordre. Un sous-groupe suit toujours
 * son choix : seuls les groupes de premier niveau se répartissent.
 */
export function sheetColumns(groups: OptionGroup[]): [OptionGroup[], OptionGroup[]] {
  const added = (g: OptionGroup) => g.kind === "extra" || g.kind === "retrait";
  const left = groups.filter((g) => !added(g));
  const right = groups.filter(added);
  if (left.length > 0 && right.length > 0) return [left, right];
  const half = Math.ceil(groups.length / 2);
  return [groups.slice(0, half), groups.slice(half)];
}
