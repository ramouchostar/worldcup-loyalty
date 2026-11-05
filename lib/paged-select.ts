// Lecture complète d'une table, par pages.
//
// PostgREST plafonne le nombre de lignes rendues par requête (réglage
// `max_rows` du projet Supabase, 1 000 par défaut) et **tronque en silence** :
// une requête qui devrait rendre 3 000 adhésions en rend 1 000, sans erreur.
// Un agrégat construit là-dessus est faux sans que rien ne le signale — c'est
// exactement le genre de chiffre sur lequel on prend une mauvaise décision.
//
// `fetchAllRows` pagine via `.range()` jusqu'à ce qu'une page revienne
// incomplète, et signale explicitement le cas où le plafond de sécurité est
// atteint plutôt que de rendre un total partiel présenté comme complet.

export type PageResult<T> = { data: T[] | null; error: { message: string } | null };

export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  { pageSize = 1000, maxRows = 100_000 }: { pageSize?: number; maxRows?: number } = {}
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    // Page incomplète = fin de table. Un `max_rows` plus bas que `pageSize`
    // ferait sortir ici avec moins de lignes qu'attendu : d'où pageSize aligné
    // sur le défaut Supabase (1 000).
    if (batch.length < pageSize) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

/**
 * Comme `fetchAllRows`, mais rend directement les lignes et REFUSE un résultat
 * tronqué : une page de la console qui agrège (jour creux, dépense par membre,
 * ventes par plat) ne doit jamais présenter un échantillon comme le tout. Si le
 * plafond de sécurité est atteint, on échoue franchement avec le nom de la
 * lecture, au lieu de calculer sur des chiffres partiels.
 */
export async function fetchAllRowsStrict<T>(
  label: string,
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  opts: { pageSize?: number; maxRows?: number } = {}
): Promise<T[]> {
  const { rows, truncated } = await fetchAllRows<T>(page, opts);
  if (truncated) throw new Error(`${label} : plafond de lecture atteint (${rows.length} lignes), résultat refusé`);
  return rows;
}
