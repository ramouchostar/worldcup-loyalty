import { belpeopleConnection, listBelpeopleSales } from "@/lib/belpeople/store";
import { belpeopleConfig } from "@/lib/belpeople/api";
import { gap, isFilled, PREFILL_MAX_GAP_PCT, PREFILL_MIN_DAYS, type DailySales } from "@/lib/belpeople/model";
import { listDailyEntries } from "@/lib/daily-revenue";
import { addDays, dayLabel } from "@/lib/daily-revenue-model";
import { todayInBrussels } from "@/lib/qr-funnel";
import { belpeopleDisconnect, belpeopleSave, belpeopleSyncNow } from "./belpeople-actions";

// ADR 0103 §4, phase 1 — le CA total Belpeople À CÔTÉ du total saisi, jamais à
// la place : rien de ce bloc n'écrit dans daily_revenue_entries.

const CARD = "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl";
const INPUT = "w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent px-2.5 py-2 text-sm";
const BTN = "rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-semibold text-sm px-4 py-2.5";
const BTN_GHOST = "rounded-lg border border-gray-300 dark:border-gray-700 font-semibold text-xs px-3 py-2";
const LABEL = "text-xs font-semibold text-gray-600 dark:text-gray-300";

const eur = (n: number) => `${n.toLocaleString("fr-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const when = (iso: string) => new Date(iso).toLocaleString("fr-BE", { timeZone: "Europe/Brussels", dateStyle: "short", timeStyle: "short" });
const DAYS = 14;

export async function BelpeopleSection({ restaurantId }: { restaurantId: string }) {
  const found = await belpeopleConnection(restaurantId);
  const configured = belpeopleConfig() !== null;

  if (found.missing) {
    return (
      <section id="belpeople" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">Belpeople : table absente</p>
        <p className="text-xs text-amber-700 mt-0.5">Appliquer docs/migrations/20261114-1130-belpeople-lecture.sql dans Supabase.</p>
      </section>
    );
  }

  const conn = found.connection;
  if (!conn) {
    return (
      <section id="belpeople" className={`${CARD} p-5 space-y-3`} aria-labelledby="h-bp">
        <h2 id="h-bp" className="text-lg font-bold text-gray-900 dark:text-white">Belpeople · CA total de la caisse</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 max-w-2xl">
          Lecture seule du CA total (tous canaux) dans Belpeople. Le chiffre s&apos;affiche ici, à côté du total saisi, sans jamais le remplacer.
          Un accord écrit du siège Belchicken est requis avant d&apos;activer la lecture quotidienne.
        </p>
        {configured ? (
          <form action={belpeopleSave} className="grid gap-3 sm:grid-cols-4 items-end">
            <input type="hidden" name="r" value={restaurantId} />
            <div className="space-y-1">
              <label htmlFor="bp-store" className={LABEL}>Magasin (store_id)</label>
              <input id="bp-store" name="store_ref" inputMode="numeric" required placeholder="223" className={INPUT} />
            </div>
            <div className="space-y-1">
              <label htmlFor="bp-email" className={LABEL}>E-mail Belpeople</label>
              <input id="bp-email" name="email" type="email" required autoComplete="off" className={INPUT} />
            </div>
            <div className="space-y-1">
              <label htmlFor="bp-pass" className={LABEL}>Mot de passe</label>
              <input id="bp-pass" name="password" type="password" required autoComplete="off" className={INPUT} />
            </div>
            <button type="submit" className={BTN}>Enregistrer et lire</button>
          </form>
        ) : (
          <p className="text-sm text-red-700">BELPEOPLE_SUPABASE_URL et BELPEOPLE_ANON_KEY manquent dans Vercel.</p>
        )}
        <p className="text-xs text-gray-500">Le mot de passe part dans le coffre (Vault), jamais dans le dépôt, jamais relisible en clair.</p>
      </section>
    );
  }

  const today = todayInBrussels();
  const from = addDays(today, -(DAYS - 1));
  const [sales, entries] = await Promise.all([listBelpeopleSales(restaurantId, from), listDailyEntries(restaurantId)]);
  const byDayBp = new Map(sales.map((s) => [s.sales_day, s]));
  const byDayEntry = entries.missing ? new Map() : new Map(entries.rows.map((e) => [e.sales_day, e.amount]));
  const days = Array.from({ length: DAYS }, (_, i) => addDays(today, -i));

  let compared = 0;
  let within = 0;
  for (const d of days) {
    const bp = byDayBp.get(d);
    const saisi = byDayEntry.get(d) as number | null | undefined;
    if (!bp || !isFilled(bp) || saisi === null || saisi === undefined) continue;
    compared += 1;
    const g = gap(bp.gross_inc_vat ?? 0, saisi);
    if (g.pct !== null && Math.abs(g.pct) <= PREFILL_MAX_GAP_PCT) within += 1;
  }
  const lastFilled = sales.find(isFilled);

  return (
    <section id="belpeople" className={`${CARD} p-5 space-y-4`} aria-labelledby="h-bp">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 id="h-bp" className="text-lg font-bold text-gray-900 dark:text-white">Belpeople · CA total de la caisse</h2>
          <p className="text-xs text-gray-500">
            Magasin {conn.store_ref} · connecté le {when(conn.connected_at)}
            {conn.last_ok_at ? ` · dernière lecture ${when(conn.last_ok_at)}` : ""}
            {lastFilled ? ` · dernier jour plein ${dayLabel(lastFilled.sales_day)}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <form action={belpeopleSyncNow}>
            <input type="hidden" name="r" value={restaurantId} />
            <button type="submit" className={BTN_GHOST}>Relire maintenant</button>
          </form>
          <form action={belpeopleDisconnect}>
            <input type="hidden" name="r" value={restaurantId} />
            <button type="submit" className={BTN_GHOST}>Déconnecter</button>
          </form>
        </div>
      </div>

      {conn.last_failed_at && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Lecture en échec depuis le {when(conn.last_failed_at)} : {conn.last_failed_reason ?? "raison inconnue"}. Ressaisir l&apos;accès si le mot de passe a changé.
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Tile label="Jours à ≤ 2 %" value={compared ? `${within}/${compared}` : "—"} sub={`comparés à la saisie · pré-remplissage à ${PREFILL_MIN_DAYS}`} />
        <Tile label="Jours lus" value={String(sales.filter(isFilled).length)} sub={`sur ${DAYS} derniers jours`} />
        <Tile label="Décalage" value={lastFilled ? `${Math.max(0, Math.round((Date.parse(today) - Date.parse(lastFilled.sales_day)) / 86400000))} j` : "—"} sub="dernier jour plein ↔ aujourd'hui" />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-200 dark:border-gray-800">
              <th className="py-2 pr-3 font-semibold">Jour de vente</th>
              <th className="py-2 pr-3 font-semibold">Belpeople (TTC)</th>
              <th className="py-2 pr-3 font-semibold">Saisi</th>
              <th className="py-2 pr-3 font-semibold">Écart</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => {
              const bp = byDayBp.get(d);
              const saisi = byDayEntry.get(d) as number | null | undefined;
              const g = bp && isFilled(bp) && saisi !== null && saisi !== undefined ? gap(bp.gross_inc_vat ?? 0, saisi) : null;
              const off = g && g.pct !== null && Math.abs(g.pct) > PREFILL_MAX_GAP_PCT;
              return (
                <tr key={d} className="border-b border-gray-100 dark:border-gray-900">
                  <td className="py-2 pr-3 whitespace-nowrap">{dayLabel(d)}{d === today ? <span className="text-xs text-gray-500"> · en cours</span> : null}</td>
                  <td className="py-2 pr-3 tabular-nums whitespace-nowrap">
                    {bp && isFilled(bp) ? <>{eur(bp.gross_inc_vat ?? 0)} <span className="text-xs text-gray-500">· {bp.orders_count} cmd</span></> : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="py-2 pr-3 tabular-nums whitespace-nowrap">{saisi !== null && saisi !== undefined ? eur(saisi) : <span className="text-gray-400">—</span>}</td>
                  <td className={`py-2 pr-3 tabular-nums whitespace-nowrap ${off ? "text-red-700 font-semibold" : ""}`}>
                    {g ? `${g.eur > 0 ? "+" : ""}${eur(g.eur)}${g.pct !== null ? ` (${g.pct > 0 ? "+" : ""}${g.pct.toLocaleString("fr-BE")} %)` : ""}` : <span className="text-gray-400">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500">
        CA total, tous canaux (caisse + plateformes), TVA comprise. Belpeople se remplit avec quelques jours de retard : les jours
        vides se compléteront à la prochaine lecture. Rien n&apos;est écrit dans le CA du jour (phase 1).
      </p>
    </section>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 px-4 py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-2xl font-bold tabular-nums text-gray-900 dark:text-white">{value}</p>
      <p className="text-[11px] text-gray-500">{sub}</p>
    </div>
  );
}
