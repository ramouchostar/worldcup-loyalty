import { belpeopleConnection, listBelpeopleHourly, listBelpeopleSales } from "@/lib/belpeople/store";
import { belpeopleConfig } from "@/lib/belpeople/api";
import { gap, isFilled, PREFILL_MAX_GAP_PCT, STALE_AFTER_DAYS, staleDays, type DailySales } from "@/lib/belpeople/model";
import { hourlyProfile, type DayType, type HourSlot } from "@/lib/belpeople/hourly";
import { listDailyEntries } from "@/lib/daily-revenue";
import { addDays, dayLabel } from "@/lib/daily-revenue-model";
import { todayInBrussels } from "@/lib/qr-funnel";
import { belpeopleBackfill, belpeopleDisconnect, belpeopleSave, belpeopleSyncNow } from "./belpeople-actions";

// ADR 0103 §4 (amendé le 2026-11-14) — Belpeople fait foi : le cron écrit le CA
// TTC de chaque jour rempli dans le CA du jour (source 'belpeople'). Ce bloc
// compare aux saisies faites à la main (jamais à lui-même) et signale les jours
// encore vides chez Belpeople au-delà de STALE_AFTER_DAYS.

const CARD = "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl";
const INPUT = "w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent px-2.5 py-2 text-sm";
const BTN = "rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-semibold text-sm px-4 py-2.5";
const BTN_GHOST = "rounded-lg border border-gray-300 dark:border-gray-700 font-semibold text-xs px-3 py-2";
const LABEL = "text-xs font-semibold text-gray-600 dark:text-gray-300";

const eur = (n: number) => `${n.toLocaleString("fr-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const when = (iso: string) => new Date(iso).toLocaleString("fr-BE", { timeZone: "Europe/Brussels", dateStyle: "short", timeStyle: "short" });
const DAYS = 30;

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
          Lecture seule du CA total (tous canaux) dans Belpeople. Une fois connecté, ce chiffre devient le CA du jour de
          l&apos;établissement : plus de saisie ni de rappel.
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
  // Seules les saisies à la main se comparent : une ligne écrite par Belpeople serait égale à elle-même.
  const byDayEntry = entries.missing ? new Map() : new Map(entries.rows.filter((e) => e.source !== "belpeople").map((e) => [e.sales_day, e.amount]));
  const stale = staleDays(sales, today, DAYS);
  const staleSet = new Set(stale);
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
          <form action={belpeopleBackfill}>
            <input type="hidden" name="r" value={restaurantId} />
            <button type="submit" className={BTN_GHOST}>Recharger l&apos;historique</button>
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

      {stale.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {stale.length} jour{stale.length > 1 ? "s" : ""} toujours vide{stale.length > 1 ? "s" : ""} chez Belpeople après {STALE_AFTER_DAYS} jours :{" "}
          {stale.map(dayLabel).join(", ")}. Fermé ce jour-là, ou Belpeople en retard ? Le CA du jour reste vide tant que rien n&apos;est lu.
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Tile label="Jours à ≤ 2 %" value={compared ? `${within}/${compared}` : "—"} sub="comparés aux saisies à la main" />
        <Tile label="Jours lus" value={String(sales.filter(isFilled).length)} sub={`sur ${DAYS} derniers jours`} />
        <Tile label="Décalage" value={lastFilled ? `${Math.max(0, Math.round((Date.parse(today) - Date.parse(lastFilled.sales_day)) / 86400000))} j` : "—"} sub="dernier jour plein ↔ aujourd'hui" />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-200 dark:border-gray-800">
              <th className="py-2 pr-3 font-semibold">Jour de vente</th>
              <th className="py-2 pr-3 font-semibold">Belpeople (TTC)</th>
              <th className="py-2 pr-3 font-semibold">Saisi à la main</th>
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
                    {bp && isFilled(bp) ? <>{eur(bp.gross_inc_vat ?? 0)} <span className="text-xs text-gray-500">· {bp.orders_count} cmd</span></> : <span className={staleSet.has(d) ? "text-red-700 font-semibold" : "text-gray-400"}>{staleSet.has(d) ? "vide" : "—"}</span>}
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
        vides se compléteront à la prochaine lecture. Chaque jour rempli devient le CA du jour de la console (il remplace une
        saisie du même jour) ; un jour vide n&apos;est jamais compté comme 0 €.
      </p>

      <HourlyProfile restaurantId={restaurantId} today={today} />
    </section>
  );
}

const HOURLY_DAYS = 28;

async function HourlyProfile({ restaurantId, today }: { restaurantId: string; today: string }) {
  const fromIso = `${addDays(today, -(HOURLY_DAYS - 1))}T00:00:00`;
  const rows = await listBelpeopleHourly(restaurantId, fromIso);
  if (rows.length === 0) return null;
  const profile = hourlyProfile(rows);

  return (
    <div className="border-t border-gray-100 dark:border-gray-800 pt-4 space-y-3">
      <div>
        <h3 className="font-semibold text-gray-900 dark:text-white">Heures pleines et creuses</h3>
        <p className="text-xs text-gray-500">Moyenne des commandes par heure sur {HOURLY_DAYS} jours — pour caler le personnel. Heure de Bruxelles.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {(["semaine", "weekend"] as DayType[]).map((type) => (
          <DayProfile key={type} title={type === "semaine" ? "En semaine (lun.–ven.)" : "Week-end (sam.–dim.)"} slots={profile[type]} />
        ))}
      </div>
      <p className="text-xs text-gray-500">
        <span className="font-semibold text-gray-700 dark:text-gray-200">Plein</span> ≥ 66 % du pic du jour ·
        <span className="font-semibold"> Creux</span> ≤ 33 %. Un creux = moins de personnel ; un plein = renfort.
      </p>
    </div>
  );
}

function DayProfile({ title, slots }: { title: string; slots: HourSlot[] }) {
  if (slots.length === 0) return <div className="text-sm text-gray-500">{title} : pas encore de données.</div>;
  const peak = slots.reduce((m, s) => Math.max(m, s.avgOrders), 0) || 1;
  return (
    <div className="space-y-1">
      <p className={LABEL}>{title}</p>
      <div className="space-y-0.5">
        {slots.map((s) => (
          <div key={s.hour} className="flex items-center gap-2 text-xs">
            <span className="w-10 tabular-nums text-gray-500">{String(s.hour).padStart(2, "0")} h</span>
            <span className="flex-1 h-3 rounded bg-gray-100 dark:bg-gray-800 overflow-hidden">
              <span
                className={`block h-full ${s.level === "plein" ? "bg-gray-900 dark:bg-white" : s.level === "creux" ? "bg-gray-300 dark:bg-gray-600" : "bg-gray-500"}`}
                style={{ width: `${Math.round((s.avgOrders / peak) * 100)}%` }}
              />
            </span>
            <span className="w-16 tabular-nums text-right text-gray-600 dark:text-gray-300">{s.avgOrders} cmd</span>
            <span className={`w-12 text-right ${s.level === "plein" ? "font-semibold text-gray-900 dark:text-white" : s.level === "creux" ? "text-gray-400" : "text-gray-500"}`}>
              {s.level === "plein" ? "plein" : s.level === "creux" ? "creux" : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
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
