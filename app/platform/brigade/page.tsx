import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminClient, createServerSupabaseClient } from "@/lib/supabase";
import { listLiveRestaurants } from "@/lib/demo";
import {
  MEASURE_DAYS,
  MIN_DECIDED_FOR_ALERT,
  MIN_HOLDOUT_FOR_EFFECT,
  PROMISED_MINUTES,
  RETURN_WINDOW_DAYS,
  YES_RATE_ALERT,
  buildReport,
  loadCampaignEffects,
  loadMeasureRows,
  type GroupMeasure,
} from "@/lib/agents/measures";
import { ASSISTANTS, REFUSAL_REASONS, REFUSAL_REASON_LABELS, type DiscardReason } from "@/lib/agents/types";

export const metadata = { title: "Brigade — Plateforme" };
export const dynamic = "force-dynamic";

// /platform/brigade (ADR 0089 §7, Brigade 06) — la trace de la brigade (ADR 0065) : de quoi dire,
// par assistant et par établissement, si la règle est fausse. Lecture seule de `agent_proposals` :
// rien ici ne décide, n'envoie ni ne modifie une idée. Établissements RÉELS seulement (ADR 0033 :
// les comptes démo ne comptent pas dans les chiffres du réseau).
//
// Ce que la page ne sait PAS mesurer, elle le dit : le temps passé est une durée d'activité estimée
// à partir des vues et des décisions (aucun chronomètre n'existe), jamais un temps de lecture.

const card = "rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 sm:p-5";
const h2 = "text-lg font-bold text-gray-900 dark:text-gray-100";
const muted = "text-sm text-gray-600 dark:text-gray-400";
const th = "py-2 px-2 text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-800";
const td = "py-2 px-2 text-sm border-b border-gray-100 dark:border-gray-800 text-gray-800 dark:text-gray-200";

const DISCARD_LABELS: Record<DiscardReason, string> = {
  plafond_du_jour: "Plafond du jour (3 idées)",
  deja_proposee: "Déjà proposée",
  refusee_recemment: "Refusée récemment",
  forfait: "Hors du forfait",
  appris: "Mise en pause après des refus",
};

const num = (n: number) => n.toLocaleString("fr-BE");
const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)} %`);
const minutes = (m: number | null) => (m === null ? "—" : `${m.toLocaleString("fr-BE")} min`);
const hours = (h: number | null) => (h === null ? "—" : h < 1 ? `${Math.round(h * 60)} min` : `${h.toLocaleString("fr-BE")} h`);
const day = (iso: string) => new Date(iso).toLocaleDateString("fr-BE", { day: "numeric", month: "short", timeZone: "Europe/Brussels" });
const discardedTotal = (m: GroupMeasure) => Object.values(m.discarded).reduce((s, n) => s + (n ?? 0), 0);

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-gray-800/60 p-3.5">
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mt-0.5">{value}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{sub}</div>
    </div>
  );
}

export default async function PlatformBrigadePage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("is_super_admin").eq("id", user.id).single();
  if (!(profile as { is_super_admin: boolean } | null)?.is_super_admin) redirect("/");

  const live = await listLiveRestaurants<{ id: string; name: string }>(admin, "id, name");
  const nameOf = new Map(live.map((r) => [r.id, r.name]));
  const liveIds = live.map((r) => r.id);

  const [rows, effects] = await Promise.all([loadMeasureRows(MEASURE_DAYS, liveIds), loadCampaignEffects(60)]);
  const unavailable = rows === null;
  const report = buildReport(rows ?? [], { todayISO: new Date().toISOString().slice(0, 10) });
  const net = report.network;
  const campaigns = (effects?.campaigns ?? []).filter((c) => nameOf.has(c.restaurantId));

  const refusalTotal = REFUSAL_REASONS.reduce((s, r) => s + (net.refusals[r] ?? 0), 0);
  const discardEntries = (Object.entries(net.discarded) as [DiscardReason, number][]).filter(([, n]) => n > 0);

  return (
    <div className="space-y-6 max-w-5xl">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Brigade : les mesures</h1>
        <p className={muted}>
          {MEASURE_DAYS} derniers jours, établissements réels. Lecture seule : de quoi dire si la règle est fausse (ADR 0065).
          Les idées elles-mêmes se voient et se préparent sur <Link href="/platform/idees" className="underline">Idées</Link>.
        </p>
      </header>

      {unavailable && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-900 dark:text-amber-200">
          La table des idées est indisponible : vérifier la migration <code>agent_proposals</code>. Aucune mesure ne peut être calculée.
        </p>
      )}

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3" aria-label="Synthèse">
        <Stat label="Idées montrées" value={num(net.shown)} sub={`${num(net.produced)} produites, ${num(discardedTotal(net))} écartées`} />
        <Stat label="Décidées" value={num(net.decided)} sub={net.decidedShare === null ? `${num(net.open)} attendent le gérant` : `${pct(net.decidedShare)} des idées closes · ${num(net.open)} ouvertes`} />
        <Stat
          label="Jours où il les ouvre"
          value={net.opened.withIdeas === 0 ? "—" : `${num(net.opened.opened)} sur ${num(net.opened.withIdeas)}`}
          sub={net.opened.share === null ? "aucun jour avec une idée" : pct(net.opened.share)}
        />
        <Stat
          label="Activité par jour (estimée)"
          value={minutes(net.time.medianMinutes)}
          sub={net.time.withinPromise === null ? "aucune activité" : `${pct(net.time.withinPromise)} des jours sous ${PROMISED_MINUTES} min`}
        />
      </section>

      {report.alerts.length > 0 ? (
        <section className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 p-3 space-y-1 text-sm text-red-900 dark:text-red-200" aria-label="Alertes">
          {report.alerts.map((a) => (
            <p key={a.assistant}>
              <strong>{a.name}</strong> : {pct(a.yesRate)} de Oui sur {a.decided} décisions, sous le seuil de {pct(YES_RATE_ALERT)}. À revoir (seuils,
              textes) ou à éteindre : c&apos;est la mesure qui décide s&apos;il reste dans la brigade.
            </p>
          ))}
        </section>
      ) : (
        <p className="rounded-lg border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-sm text-emerald-900 dark:text-emerald-200">
          Pas d&apos;alerte. Un taux de Oui ne se juge qu&apos;à partir de {MIN_DECIDED_FOR_ALERT} idées décidées par assistant ; sous ce nombre, il s&apos;affiche
          sans être jugé.
        </p>
      )}

      {(net.failedExecutions > 0 || net.awaitingTeam > 0) && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-900 dark:text-amber-200">
          {net.failedExecutions > 0 && <>{num(net.failedExecutions)} « Oui » en échec d&apos;exécution. </>}
          {net.awaitingTeam > 0 && <>{num(net.awaitingTeam)} « Oui » attendent l&apos;équipe. </>}
          <Link href="/platform/idees" className="underline">Voir sur Idées</Link>.
        </p>
      )}

      <section className={`${card} space-y-3`} aria-labelledby="par-assistant">
        <h2 id="par-assistant" className={h2}>Par assistant</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr>
                <th className={th}>Assistant</th>
                <th className={`${th} text-right`}>Montrées</th>
                <th className={`${th} text-right`}>Décidées</th>
                <th className={`${th} text-right`}>Taux de Oui</th>
                <th className={`${th} text-right`}>Délai médian</th>
                <th className={`${th} text-right`}>Écartées</th>
                <th className={`${th} text-right`}>Statut</th>
              </tr>
            </thead>
            <tbody>
              {report.byAssistant.map(({ assistant, name, measure: m }) => (
                <tr key={assistant} className={m.produced === 0 ? "text-gray-400" : ""}>
                  <td className={td}>
                    <span className="font-medium">{name}</span> <span className="text-xs text-gray-500">{ASSISTANTS[assistant].post}</span>
                  </td>
                  <td className={`${td} text-right`}>{num(m.shown)}</td>
                  <td className={`${td} text-right`}>{num(m.decided)}</td>
                  <td className={`${td} text-right`}>{pct(m.yesRate)}</td>
                  <td className={`${td} text-right`}>{hours(m.medianDecisionHours)}</td>
                  <td className={`${td} text-right`}>{num(discardedTotal(m))}</td>
                  <td className={`${td} text-right`}>
                    {m.yesRateAlert ? (
                      <span className="rounded px-2 py-0.5 text-xs bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-300">À revoir</span>
                    ) : m.produced === 0 ? (
                      <span className="text-xs">muet</span>
                    ) : m.decided === 0 ? (
                      <span className="text-xs text-gray-500">rien de décidé</span>
                    ) : m.tooFewToJudge ? (
                      <span className="text-xs text-gray-500">peu de recul</span>
                    ) : (
                      <span className="text-xs text-gray-500">ok</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={muted}>
          « Muet » : l&apos;assistant n&apos;a rien proposé sur la période. C&apos;est un bon état quand il n&apos;a pas de bonne idée, un signal quand on en attendait
          une : sa raison se lit dans le rapport du passage du matin sur <Link href="/platform/idees" className="underline">Idées</Link>.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className={`${card} space-y-2`} aria-labelledby="refus">
          <h2 id="refus" className={h2}>Raisons de refus</h2>
          {refusalTotal === 0 ? (
            <p className={muted}>Aucun refus sur la période.</p>
          ) : (
            <ul className="text-sm text-gray-800 dark:text-gray-200 space-y-1">
              {REFUSAL_REASONS.filter((r) => (net.refusals[r] ?? 0) > 0).map((r) => (
                <li key={r} className="flex justify-between gap-3">
                  <span>{REFUSAL_REASON_LABELS[r]}</span>
                  <span className="tabular-nums">{num(net.refusals[r] ?? 0)}</span>
                </li>
              ))}
              {net.refusalNotes > 0 && <li className="text-gray-500 pt-1">{num(net.refusalNotes)} saisie(s) libre(s) à lire sur Idées.</li>}
            </ul>
          )}
        </div>
        <div className={`${card} space-y-2`} aria-labelledby="ecartees">
          <h2 id="ecartees" className={h2}>Écartées avant d&apos;être montrées</h2>
          {discardEntries.length === 0 ? (
            <p className={muted}>Aucune idée écartée sur la période.</p>
          ) : (
            <ul className="text-sm text-gray-800 dark:text-gray-200 space-y-1">
              {discardEntries.map(([why, n]) => (
                <li key={why} className="flex justify-between gap-3">
                  <span>{DISCARD_LABELS[why]}</span>
                  <span className="tabular-nums">{num(n)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className={muted}>Rien ne disparaît en silence : chaque idée écartée garde sa raison.</p>
        </div>
      </section>

      <section className={`${card} space-y-3`} aria-labelledby="relances">
        <h2 id="relances" className={h2}>Effet des relances contre le groupe témoin</h2>
        {effects === null ? (
          <p className={muted}>Lecture impossible : la table des idées est indisponible.</p>
        ) : campaigns.length === 0 ? (
          <p className={muted}>Aucune relance exécutée : rien à comparer au groupe témoin.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th className={th}>Établissement</th>
                  <th className={th}>Envoyée le</th>
                  <th className={`${th} text-right`}>Traités revenus</th>
                  <th className={`${th} text-right`}>Témoins revenus</th>
                  <th className={`${th} text-right`}>Écart</th>
                  <th className={th}>Lecture</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.campaignId}>
                    <td className={td}>{nameOf.get(c.restaurantId)}</td>
                    <td className={td}>{day(c.sentAt)}</td>
                    <td className={`${td} text-right`}>{num(c.effect.treatedReturned)} / {num(c.effect.treated)} ({pct(c.effect.treatedRate)})</td>
                    <td className={`${td} text-right`}>{num(c.effect.holdoutReturned)} / {num(c.effect.holdout)} ({pct(c.effect.holdoutRate)})</td>
                    <td className={`${td} text-right`}>{c.effect.liftPoints === null ? "—" : `${c.effect.liftPoints > 0 ? "+" : ""}${c.effect.liftPoints.toLocaleString("fr-BE")} pts`}</td>
                    <td className={td}>
                      {!c.effect.complete ? "en cours (14 jours pas écoulés)" : !c.effect.enoughHoldout ? `trop peu de témoins pour conclure (moins de ${MIN_HOLDOUT_FOR_EFFECT})` : "à lire avec les effectifs"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {effects && effects.unreadable > 0 && (
          <p className="text-sm text-amber-800 dark:text-amber-300">
            {num(effects.unreadable)} relance(s) sans journal lisible : leur effet ne peut pas être mesuré.
          </p>
        )}
        <p className={muted}>
          Un client est « revenu » s&apos;il a un ticket validé dans les {RETURN_WINDOW_DAYS} jours après l&apos;envoi. L&apos;écart ne prouve rien tout seul : il se lit
          avec les effectifs, et jamais comme « grâce à la brigade » (ADR 0064).
        </p>
      </section>

      <section className={`${card} space-y-3`} aria-labelledby="par-etablissement">
        <h2 id="par-etablissement" className={h2}>Par établissement</h2>
        {report.byRestaurant.length === 0 ? (
          <p className={muted}>Aucune idée sur la période.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th className={th}>Établissement</th>
                  <th className={`${th} text-right`}>Montrées</th>
                  <th className={`${th} text-right`}>Décidées</th>
                  <th className={`${th} text-right`}>Taux de Oui</th>
                  <th className={`${th} text-right`}>Jours ouverts</th>
                  <th className={`${th} text-right`}>Activité par jour (estimée)</th>
                </tr>
              </thead>
              <tbody>
                {report.byRestaurant.map((r) => (
                  <tr key={r.restaurantId}>
                    <td className={td}>{nameOf.get(r.restaurantId) ?? r.restaurantId}</td>
                    <td className={`${td} text-right`}>{num(r.measure.shown)}</td>
                    <td className={`${td} text-right`}>{num(r.measure.decided)}</td>
                    <td className={`${td} text-right`}>{pct(r.measure.yesRate)}</td>
                    <td className={`${td} text-right`}>{r.opened.withIdeas === 0 ? "—" : `${num(r.opened.opened)} sur ${num(r.opened.withIdeas)}`}</td>
                    <td className={`${td} text-right`}>{minutes(r.time.medianMinutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className={muted}>
          Le temps est une durée d&apos;activité <strong>estimée</strong> à partir des vues et des décisions (deux événements à plus de 10 minutes d&apos;écart
          font deux visites). Rien ne chronomètre l&apos;écran : c&apos;est un plancher, pas une mesure.
        </p>
      </section>
    </div>
  );
}
