import { activeConnection, listOrderRows, listReferences, recentJournal, refusedCallbacksSince } from "@/lib/hubrise/store";
import { CHANNEL_LABEL, PREFILL_MAX_GAP_PCT, PREFILL_MIN_DAYS, gap, summarizeByDay, type ChannelKey } from "@/lib/hubrise/model";
import { hubriseCredentials } from "@/lib/hubrise/api";
import { addDays, dayLabel } from "@/lib/daily-revenue-model";
import { todayInBrussels } from "@/lib/qr-funnel";
import { hubriseDisconnect, hubriseSaveReference, hubriseSyncNow } from "./hubrise-actions";

// ADR 0102 §4, phase 1 — le chiffre HubRise À CÔTÉ de la référence, jamais à
// la place : rien de ce bloc n'écrit dans daily_revenue_entries.

const CARD = "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl";
const INPUT = "w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent px-2.5 py-2 text-sm";
const BTN = "rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-semibold text-sm px-4 py-2.5";
const BTN_GHOST = "rounded-lg border border-gray-300 dark:border-gray-700 font-semibold text-xs px-3 py-2";
const LABEL = "text-xs font-semibold text-gray-600 dark:text-gray-300";

const eur = (n: number) => `${n.toLocaleString("fr-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const when = (iso: string) => new Date(iso).toLocaleString("fr-BE", { timeZone: "Europe/Brussels", dateStyle: "short", timeStyle: "short" });
const DAYS = 14;
const COMPARED: ChannelKey[] = ["uber", "deliveroo", "takeaway"];

export async function HubriseSection({ restaurantId }: { restaurantId: string }) {
  const found = await activeConnection(restaurantId);
  const configured = hubriseCredentials() !== null;

  if (found.missing) {
    return (
      <section id="hubrise" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">HubRise : tables absentes</p>
        <p className="text-xs text-amber-700 mt-0.5">Appliquer docs/migrations/20261113-2345-hubrise-lecture.sql dans Supabase.</p>
      </section>
    );
  }

  const conn = found.connection;
  if (!conn) {
    return (
      <section id="hubrise" className={`${CARD} p-5 space-y-2`} aria-labelledby="h-hubrise">
        <h2 id="h-hubrise" className="text-lg font-bold text-gray-900 dark:text-white">HubRise · lecture des commandes</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 max-w-2xl">
          Lecture seule des commandes d&apos;un point de vente HubRise (ADR 0102). Le chiffre s&apos;affiche ici, à côté de la
          référence, sans jamais remplacer le CA du jour.
        </p>
        {configured ? (
          <a href={`/api/hubrise/connect?r=${encodeURIComponent(restaurantId)}`} className={`${BTN} inline-block`}>
            Connecter HubRise
          </a>
        ) : (
          <p className="text-sm text-red-700">HUBRISE_CLIENT_ID et HUBRISE_CLIENT_SECRET manquent dans Vercel.</p>
        )}
      </section>
    );
  }

  const today = todayInBrussels();
  const from = addDays(today, -(DAYS - 1));
  const [rows, refs, log, refused] = await Promise.all([
    listOrderRows(restaurantId, from),
    listReferences(restaurantId, from),
    recentJournal(conn.id),
    refusedCallbacksSince(new Date(Date.now() - 7 * 86_400_000).toISOString()),
  ]);
  const byDay = summarizeByDay(rows);
  const refOf = new Map(refs.map((r) => [`${r.sales_day}|${r.channel}`, r]));
  const channels = COMPARED.filter((c) => rows.some((r) => byDay.get(r.sales_day)?.channels[c]) || refs.some((r) => r.channel === c));
  const shown: ChannelKey[] = channels.length ? channels : ["uber"];
  const days = Array.from({ length: DAYS }, (_, i) => addDays(today, -i));

  // Jours comparables par canal (HubRise ET référence) et jours dans le seuil.
  const verdicts = shown.map((c) => {
    let compared = 0;
    let within = 0;
    for (const d of days) {
      const h = byDay.get(d)?.channels[c];
      const ref = refOf.get(`${d}|${c}`);
      if (!h || !ref || d === today) continue;
      compared += 1;
      const g = gap(h.amount, ref.amount);
      if (g.pct !== null && Math.abs(g.pct) <= PREFILL_MAX_GAP_PCT) within += 1;
    }
    return { c, compared, within };
  });

  const week = days.slice(0, 7);
  const weekAll = week.reduce((s, d) => s + (byDay.get(d)?.all ?? 0), 0);
  const weekCallback = week.reduce((s, d) => s + (byDay.get(d)?.viaCallback ?? 0), 0);

  return (
    <section id="hubrise" className={`${CARD} p-5 space-y-4`} aria-labelledby="h-hubrise">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 id="h-hubrise" className="text-lg font-bold text-gray-900 dark:text-white">HubRise · lecture des commandes</h2>
          <p className="text-xs text-gray-500">
            {conn.account_name ?? "Compte"} · {conn.location_name ?? "Point de vente"} ({conn.location_id}) · connecté le {when(conn.connected_at)}
            {conn.last_ok_at ? ` · dernière lecture ${when(conn.last_ok_at)}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <form action={hubriseSyncNow}>
            <input type="hidden" name="r" value={restaurantId} />
            <button type="submit" className={BTN_GHOST}>Relire les 3 derniers jours</button>
          </form>
          <form action={hubriseDisconnect}>
            <input type="hidden" name="r" value={restaurantId} />
            <button type="submit" className={BTN_GHOST}>Déconnecter</button>
          </form>
        </div>
      </div>

      {conn.last_failed_at && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Lecture en échec depuis le {when(conn.last_failed_at)} : {conn.last_failed_reason ?? "raison inconnue"}. Reconnecter HubRise si le jeton a été révoqué.
          <a href={`/api/hubrise/connect?r=${encodeURIComponent(restaurantId)}`} className="ml-2 underline font-semibold">Reconnecter</a>
        </div>
      )}
      {!conn.callback_url && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Rappel HubRise non posé : seules la relecture de nuit et le bouton « Relire » apportent les commandes.
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile label="Arrivées par rappel (7 j)" value={weekAll ? `${weekCallback}/${weekAll}` : "—"} sub="le reste rattrapé par la relecture" />
        <Tile label="Rappels refusés (7 j)" value={String(refused)} sub="signature ou point de vente inconnu" />
        {verdicts.map((v) => (
          <Tile
            key={v.c}
            label={`${CHANNEL_LABEL[v.c]} à ≤ ${PREFILL_MAX_GAP_PCT} %`}
            value={v.compared ? `${v.within}/${v.compared}` : "—"}
            sub={`jours comparés · pré-remplissage à ${PREFILL_MIN_DAYS}`}
          />
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-200 dark:border-gray-800">
              <th className="py-2 pr-3 font-semibold">Jour de vente</th>
              {shown.map((c) => (
                <th key={c} className="py-2 pr-3 font-semibold" colSpan={3}>{CHANNEL_LABEL[c]} : HubRise · référence · écart</th>
              ))}
              <th className="py-2 pr-3 font-semibold">Autres canaux</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => {
              const s = byDay.get(d);
              const others = s ? (Object.entries(s.channels) as [ChannelKey, { orders: number; amount: number }][]).filter(([k]) => !shown.includes(k)) : [];
              return (
                <tr key={d} className="border-b border-gray-100 dark:border-gray-900 align-top">
                  <td className="py-2 pr-3 whitespace-nowrap">{dayLabel(d)}{d === today ? <span className="text-xs text-gray-500"> · en cours</span> : null}</td>
                  {shown.map((c) => {
                    const h = s?.channels[c];
                    const ref = refOf.get(`${d}|${c}`);
                    const g = h && ref ? gap(h.amount, ref.amount) : null;
                    const off = g && g.pct !== null && Math.abs(g.pct) > PREFILL_MAX_GAP_PCT;
                    return [
                      <td key={`${c}-h`} className="py-2 pr-3 tabular-nums whitespace-nowrap">
                        {h ? <>{eur(h.amount)} <span className="text-xs text-gray-500">· {h.orders} cmd{h.excluded ? `, ${h.excluded} annulée(s)` : ""}</span></> : <span className="text-gray-400">—</span>}
                      </td>,
                      <td key={`${c}-r`} className="py-2 pr-3 tabular-nums whitespace-nowrap">
                        {ref ? <>{eur(ref.amount)} <span className="text-xs text-gray-500">· {ref.source ?? ""}</span></> : <span className="text-gray-400">—</span>}
                      </td>,
                      <td key={`${c}-g`} className={`py-2 pr-3 tabular-nums whitespace-nowrap ${off ? "text-red-700 font-semibold" : ""}`}>
                        {g ? `${g.eur > 0 ? "+" : ""}${eur(g.eur)}${g.pct !== null ? ` (${g.pct > 0 ? "+" : ""}${g.pct.toLocaleString("fr-BE")} %)` : ""}` : <span className="text-gray-400">—</span>}
                      </td>,
                    ];
                  })}
                  <td className="py-2 pr-3 text-xs text-gray-600 dark:text-gray-400">
                    {others.length ? others.map(([k, v]) => `${CHANNEL_LABEL[k]} ${eur(v.amount)} (${v.orders})`).join(" · ") : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <form action={hubriseSaveReference} className="grid gap-3 sm:grid-cols-5 items-end border-t border-gray-100 dark:border-gray-800 pt-4">
        <input type="hidden" name="r" value={restaurantId} />
        <div className="space-y-1">
          <label htmlFor="hr-jour" className={LABEL}>Jour de vente</label>
          <input id="hr-jour" name="jour" type="date" required defaultValue={addDays(today, -1)} max={today} className={INPUT} />
        </div>
        <div className="space-y-1">
          <label htmlFor="hr-canal" className={LABEL}>Canal</label>
          <select id="hr-canal" name="canal" defaultValue="uber" className={INPUT}>
            {COMPARED.map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="hr-montant" className={LABEL}>Référence (€, TVA comprise)</label>
          <input id="hr-montant" name="montant" inputMode="decimal" required placeholder="266,40" className={INPUT} />
        </div>
        <div className="space-y-1">
          <label htmlFor="hr-source" className={LABEL}>Source</label>
          <input id="hr-source" name="source" defaultValue="relevé Uber Eats Manager" className={INPUT} />
        </div>
        <button type="submit" className={BTN}>Noter la référence</button>
      </form>
      <p className="text-xs text-gray-500">
        Référence = relevé noté ici, sinon la ligne saisie par le restaurateur dans le CA du jour. Jour de vente : à Bruxelles, une
        commande avant 5 h compte pour la veille. Commandes annulées, refusées ou non livrées exclues.
      </p>

      {log.length > 0 && (
        <details className="text-xs text-gray-600 dark:text-gray-400">
          <summary className="cursor-pointer font-semibold">Journal</summary>
          <ul className="mt-2 space-y-1">
            {log.map((l, i) => (
              <li key={i}>{when(l.at)} · {l.kind} · {JSON.stringify(l.detail)}</li>
            ))}
          </ul>
        </details>
      )}
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
