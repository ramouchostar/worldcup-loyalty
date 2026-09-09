import { STEP_VIEW, type FunnelReport } from "@/lib/funnel";

// ADR 0037 — les dix étages du parcours ticket, pour UN établissement.
//
// Lecture verticale et pas un tableau jour × étape : ce qu'on vient chercher
// ici est « où décroche-t-on ? », c'est-à-dire une comparaison entre étages,
// pas entre jours. Le tableau par jour existe juste au-dessus pour les quatre
// étages historiques.
//
// Aucun euro, aucune donnée personnelle : des compteurs (ADR 0007/0025).
export function FunnelStepsTable({ report }: { report: FunnelReport }) {
  const max = Math.max(1, ...report.steps.map((s) => s.count));

  return (
    <section className="mb-8">
      <h2 className="text-sm font-semibold text-gray-900 mb-1">
        Entonnoir détaillé — {report.days} derniers jours
      </h2>
      <p className="text-xs text-gray-500 mb-3">
        Compteurs serveur, sans cookie ni identifiant de session (ADR 0037). Ils comptent des{" "}
        <strong>événements, pas des personnes</strong> — un rechargement compte deux fois. Le taux
        de passage est indiqué entre les seuls étages qui se suivent réellement : un membre déjà
        inscrit saute les deux étages de compte, et « validé » / « refusé » sont deux sorties du
        même étage.
      </p>

      {report.empty ? (
        <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          Aucun franchissement compté pour l&apos;instant. Si la migration{" "}
          <code className="bg-gray-100 px-1 rounded">20260909-2340-funnel-events.sql</code>{" "}
          n&apos;est pas appliquée, les étages restent à zéro — les deux étages dérivés (arrivées,
          comptes créés) remontent quand même.
        </p>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
          {report.steps.map(({ step, count, rate }) => {
            const view = STEP_VIEW[step];
            return (
              <div key={step} className="px-3 py-2.5">
                <div className="flex items-baseline gap-3">
                  <span className="text-sm text-gray-800 flex-1 min-w-0">{view.label}</span>
                  <span className="text-sm font-semibold text-gray-900 tabular-nums">{count || "—"}</span>
                  <span className="text-xs text-gray-500 tabular-nums w-28 text-right shrink-0">
                    {rate === null
                      ? ""
                      : `${Math.round(rate)} % de « ${STEP_VIEW[view.rateFrom!].label.toLowerCase()} »`}
                  </span>
                </div>
                {/* Barre proportionnelle au plus grand étage : la forme de
                    l'entonnoir se lit d'un coup d'œil, avant les chiffres. */}
                <div className="mt-1.5 h-1 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gray-400 rounded-full"
                    style={{ width: `${Math.round((count / max) * 100)}%` }}
                  />
                </div>
                <p className="text-[11px] text-gray-400 mt-1">{view.hint}</p>
              </div>
            );
          })}
        </div>
      )}

      {report.rejections.length > 0 && (
        <div className="mt-3">
          <h3 className="text-xs font-semibold text-gray-700 mb-1.5">Motifs de refus</h3>
          <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
            {report.rejections.map((r) => (
              <div key={r.reason} className="px-3 py-2 flex items-baseline gap-3">
                <span className="text-sm text-gray-800 flex-1">{r.label}</span>
                <span className="text-sm font-semibold text-gray-900 tabular-nums">{r.count}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 mt-1">
            Un rejet manuel depuis la file d&apos;arbitrage compte sans motif : le restaurateur
            écrit un texte libre, qu&apos;on ne range pas de force dans une de ces cases.
          </p>
        </div>
      )}
    </section>
  );
}
