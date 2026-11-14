import { belpeopleConnection, exploreBelpeopleProducts } from "@/lib/belpeople/store";
import type { ExploredTable } from "@/lib/belpeople/api";

// ADR 0103 §6 — exploration des ventes par produit, ouverte seulement à la
// demande (?bp_explore=1) : on regarde la forme des données avant de construire
// « Ventes par plat » sur le total de la caisse. Lecture seule, rien n'est gardé.

const CARD = "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl";

const cell = (v: unknown) => (v === null || v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));

export async function BelpeopleExplorer({ restaurantId }: { restaurantId: string }) {
  const found = await belpeopleConnection(restaurantId);
  if (found.missing || !found.connection) {
    return <p className="text-sm text-gray-500">Belpeople n&apos;est pas connecté pour cet établissement.</p>;
  }
  let tables: ExploredTable[];
  try {
    tables = await exploreBelpeopleProducts(found.connection);
  } catch (e) {
    return (
      <div id="bp-explorer" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        Exploration impossible : {(e as Error).message}
      </div>
    );
  }
  return (
    <section id="bp-explorer" className={`${CARD} p-5 space-y-4`} aria-labelledby="h-bp-explore">
      <div className="space-y-1">
        <h2 id="h-bp-explore" className="text-lg font-bold text-gray-900 dark:text-white">Belpeople : ventes par produit (exploration)</h2>
        <p className="text-xs text-gray-500 max-w-2xl">
          Tables de produits et de ventes visibles avec cet accès. Les lignes ne sont lues que pour le magasin {found.connection.store_ref},
          5 au plus ; une table sans magasin est seulement décrite ; les colonnes qui pourraient porter une donnée client ne sont jamais lues.
          Rien n&apos;est enregistré.
        </p>
      </div>
      {tables.length === 0 && <p className="text-sm text-gray-500">Aucune table de produits trouvée.</p>}
      {tables.map((t) => (
        <div key={t.name} className="border-t border-gray-100 dark:border-gray-800 pt-3 space-y-2">
          <p className="font-semibold text-gray-900 dark:text-white">
            {t.name}{" "}
            <span className="text-xs font-normal text-gray-500">
              {t.storeColumn ? `magasin : ${t.storeColumn}` : "sans colonne magasin (non lue)"}
              {t.dateColumn ? `, période : ${t.dateColumn}` : ""}
            </span>
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400 break-words">Colonnes : {t.columns.join(", ")}</p>
          {t.hidden.length > 0 && <p className="text-xs text-gray-500">Jamais lues : {t.hidden.join(", ")}</p>}
          {t.error && <p className="text-xs text-red-700">{t.error}</p>}
          {t.rows && t.rows.length === 0 && <p className="text-xs text-gray-500">Aucune ligne pour ce magasin.</p>}
          {t.rows && t.rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="text-xs">
                <thead>
                  <tr className="text-left text-gray-500">
                    {t.readable.map((c) => <th key={c} className="py-1 pr-3 font-semibold whitespace-nowrap">{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {t.rows.map((r, i) => (
                    <tr key={i} className="border-t border-gray-100 dark:border-gray-900">
                      {t.readable.map((c) => <td key={c} className="py-1 pr-3 whitespace-nowrap tabular-nums">{cell(r[c])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
