import { slotLabel, EXPLORATION_PCT } from "@/lib/pro-sequence-rules";
import { formatDelay, MIN_CLICKS_BEST, MIN_SENDS_PER_SLOT, summarizeSlots, timingVerdict } from "@/lib/send-timing";
import type { TimingOverview } from "@/lib/send-timing-data";
import { setTimingAction } from "@/app/platform/messages/actions";

// ADR 0077 §4 — « Meilleures heures » : à quelle heure un restaurateur clique.
// Par créneau d'envoi (la rotation 9 h / 11 h / 15 h / 17 h 30), puis deux
// signaux plus rapides : quand les gérants ouvrent leur console, et quand les
// membres cliquent. Aucune conclusion sous les seuils ; la décision de fixer
// l'heure reste humaine.

function pct(n: number | null): string {
  return n === null ? "—" : `${n} %`;
}

function hourRange(h: number): string {
  return `${h} h – ${(h + 1) % 24} h`;
}

// 24 barres, une série, une couleur : pas de légende, le titre la nomme.
// Survol natif (title) par barre ; le pic est écrit en clair sous le titre.
function HourBars({ title, values, unit, empty }: { title: string; values: number[]; unit: string; empty: string }) {
  const max = Math.max(...values);
  const total = values.reduce((a, b) => a + b, 0);
  const peak = values.indexOf(max);
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 min-w-0">
      <p className="text-sm font-medium text-gray-900">{title}</p>
      <p className="text-xs text-gray-500 mt-0.5">
        {total === 0 ? empty : `${total} ${unit} · pic ${hourRange(peak)}`}
      </p>
      {total > 0 && (
        <>
          <div className="mt-3 h-28 flex items-end gap-[2px]" role="img" aria-label={`${title} : pic ${hourRange(peak)}`}>
            {values.map((v, h) => (
              <div key={h} className="flex-1 h-full flex items-end" title={`${hourRange(h)} : ${v} ${unit}`}>
                <div
                  className={`w-full rounded-t-[4px] ${h === peak ? "bg-gray-900" : "bg-gray-400"}`}
                  style={{ height: v === 0 ? "1px" : `${Math.max(4, (v / max) * 100)}%` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1 flex text-[10px] text-gray-500 tabular-nums">
            {values.map((_, h) => (
              <span key={h} className="flex-1 text-center">{h % 3 === 0 ? h : ""}</span>
            ))}
          </div>
          <table className="sr-only">
            <caption>{title}</caption>
            <tbody>
              {values.map((v, h) => (
                <tr key={h}><th>{hourRange(h)}</th><td>{v}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

export function SendTimingSection({ o }: { o: TimingOverview }) {
  const all = summarizeSlots(o.proSends);
  const email = summarizeSlots(o.proSends, "email");
  const push = summarizeSlots(o.proSends, "push");
  const verdict = timingVerdict(all);
  const maxRate = Math.max(1, ...all.map((s) => s.rate ?? 0));
  const locked = o.timing.lockedSlot;

  return (
    <section>
      <div className="mb-3">
        <h2 className="text-lg font-bold text-gray-900">Meilleures heures</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Séquences restaurateur (ADR 0077) : chaque envoi part à un créneau qui tourne, et on garde le clic et son heure,
          e-mail comme push. Réseau réel, 12 derniers mois.
        </p>
      </div>

      {(!o.slotColumn || !o.available) && (
        <div className="mb-3 bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-900">
          {!o.slotColumn && <p>Colonne des créneaux absente : appliquer <span className="font-mono">20261003-2010-creneau-envoi-messages.sql</span>.</p>}
          {!o.available && <p>Compteur des ouvertures absent : appliquer <span className="font-mono">20261003-2230-heures-envoi-et-visites-console.sql</span>.</p>}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-2xl overflow-x-auto">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-100">
              <th className="px-4 py-3 font-semibold">Départ</th>
              <th className="px-4 py-3 font-semibold text-right">E-mails · clics</th>
              <th className="px-4 py-3 font-semibold text-right">Pushs · clics</th>
              <th className="px-4 py-3 font-semibold">Taux de clic (tous canaux)</th>
              <th className="px-4 py-3 font-semibold text-right">Délai médian</th>
            </tr>
          </thead>
          <tbody>
            {all.map((s, i) => {
              const best = verdict.kind === "best" && verdict.slot === s.slot;
              return (
                <tr key={s.slot} className={`border-b border-gray-50 last:border-0 ${best ? "bg-green-50" : ""}`}>
                  <td className={`px-4 py-2.5 font-semibold ${best ? "text-green-800" : "text-gray-900"}`}>
                    {slotLabel(s.slot)}
                    {locked === s.slot && <span className="ml-2 text-[11px] font-medium text-gray-500">fixée</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{email[i].sends} · {email[i].clicks}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{push[i].sends} · {push[i].clicks}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2" title={`${s.clicks} clics sur ${s.sends} envois`}>
                      <div className="w-32 h-[7px] bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gray-900 rounded-full" style={{ width: `${((s.rate ?? 0) / maxRate) * 100}%` }} />
                      </div>
                      <span className="tabular-nums text-gray-900">{pct(s.rate)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{formatDelay(s.medianDelayMin)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 bg-gray-50 border border-gray-200 rounded-2xl p-4 text-sm text-gray-800 space-y-2">
        {verdict.kind === "wait" ? (
          <p>
            <span className="font-semibold">Pas encore de conclusion.</span> Il faut au moins {MIN_SENDS_PER_SLOT} envois par
            créneau et {MIN_CLICKS_BEST} clics pour le meilleur. Aujourd&apos;hui : {verdict.totalSends} envoi
            {verdict.totalSends > 1 ? "s" : ""}, {verdict.missingSlots} créneau{verdict.missingSlots > 1 ? "x" : ""} sous le seuil.
            Les envois continuent de tourner.
          </p>
        ) : (
          <p>
            <span className="font-semibold">Recommandé : {slotLabel(verdict.slot)}</span>, {verdict.rate} % de clics. En la
            fixant, {100 - EXPLORATION_PCT} % des envois partiront à cette heure ; les autres continueront d&apos;explorer.
          </p>
        )}
        <p className="text-gray-600">
          Heure actuelle : {locked ? <>fixée à <span className="font-semibold">{slotLabel(locked)}</span></> : "rotation entre les quatre créneaux"}.
        </p>
        <div className="flex flex-wrap gap-2">
          {verdict.kind === "best" && locked !== verdict.slot && (
            <form action={setTimingAction}>
              <input type="hidden" name="slot" value={verdict.slot} />
              <button type="submit" className="bg-gray-900 text-white text-xs font-semibold px-3 py-2 rounded-lg hover:bg-gray-700">
                Fixer {slotLabel(verdict.slot)}
              </button>
            </form>
          )}
          {locked !== null && (
            <form action={setTimingAction}>
              <input type="hidden" name="slot" value="" />
              <button type="submit" className="bg-white border border-gray-300 text-gray-800 text-xs font-semibold px-3 py-2 rounded-lg hover:border-gray-500">
                Revenir à la rotation
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <HourBars
          title="Ouvertures de la console par heure · 90 j"
          values={o.visitsByHour}
          unit="ouvertures"
          empty="Aucune ouverture comptée pour l'instant (une par gérant et par heure)."
        />
        <HourBars
          title="Clics des membres par heure · séquences, 90 j"
          values={o.memberClicksByHour}
          unit="clics"
          empty="Aucun clic de membre sur 90 jours. Leurs séquences partent toutes à 18 h."
        />
      </div>
      <p className="text-xs text-gray-500 mt-2">
        Appareils abonnés aux alertes de la console : {o.pushDevices ?? "table absente"}. Les ouvertures de la console arrivent
        bien avant que les clics suffisent : c&apos;est le signal à lire en attendant.
      </p>
    </section>
  );
}
