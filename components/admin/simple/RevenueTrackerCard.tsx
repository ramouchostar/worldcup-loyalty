import { Lock, TrendingDown, TrendingUp } from "lucide-react";
import { RequestPlanButton } from "@/components/admin/Paywall";
import { dayLabel } from "@/lib/daily-revenue-model";
import type { RevenueTracker } from "@/lib/revenue-tracker";

// « Ton chiffre d'affaires », jour par jour (ADR 0081 §7) — sur l'accueil,
// dès que le CA du jour est noté, sans attendre les 28 jours du départ des
// paliers. Croissance et Pro ; en Gratuit la carte reste visible, verrouillée,
// avec le vrai nombre de jours déjà notés (ADR 0081 §4 : jamais une page vide).
//
// Charte Boosteats fixe (boost-*). Les euros sont permis : surface
// restaurateur (ADR 0027 §1), jamais un membre (ADR 0007).

const eur = (n: number) => n.toLocaleString("fr-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const eur2 = (n: number) => n.toLocaleString("fr-BE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed = (p: number) => `${p > 0 ? "+" : p < 0 ? "−" : "±"}${Math.abs(p)} %`;

export function RevenueTrackerCard({
  tracker,
  allowed,
  restaurantId,
}: {
  tracker: RevenueTracker;
  allowed: boolean;
  restaurantId: string;
}) {
  if (!allowed) return <LockedCard notedDays={tracker.notedDays} restaurantId={restaurantId} />;
  const t = tracker;

  return (
    <section className="bg-white border border-paper-border rounded-2xl p-5" aria-labelledby="ton-ca">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="ton-ca" className="font-brand-display text-[20px] font-extrabold text-ink">
          Ton chiffre d&apos;affaires
        </h2>
        <span className="text-[12px] text-ink-faint tabular-nums">{t.notedDays} jours notés</span>
      </div>

      {t.last === null ? (
        <p className="text-[14px] text-ink-muted mt-3">
          Pas encore de chiffre d&apos;affaires noté. Envoie le chiffre de ta caisse à l&apos;équipe Boosteats chaque soir : il
          s&apos;affiche ici dès le lendemain.
        </p>
      ) : (
        <>
          {/* Le dernier jour noté, face aux mêmes jours de la semaine */}
          <div className="mt-4">
            <p className="text-[13px] text-ink-muted">{capitalize(dayLabel(t.last.day))}</p>
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="font-brand-display text-[40px] font-extrabold leading-tight tracking-[-0.02em] tabular-nums text-ink">
                {eur(t.last.amount)}
              </span>
              {t.last.deltaPct !== null && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-bold tabular-nums ${
                    t.last.deltaPct >= 0 ? "bg-boost-cream text-boost-olive-dark" : "bg-paper-subtle text-ink-body"
                  }`}
                >
                  {t.last.deltaPct >= 0 ? (
                    <TrendingUp size={14} strokeWidth={2.4} aria-hidden="true" />
                  ) : (
                    <TrendingDown size={14} strokeWidth={2.4} aria-hidden="true" />
                  )}
                  {signed(t.last.deltaPct)}
                </span>
              )}
            </div>
            <p className="text-[13px] text-ink-muted mt-0.5">
              {t.last.sameAvg !== null
                ? t.last.sameCount === 1
                  ? `${capitalize(t.last.weekday)} dernier : ${eur(t.last.sameAvg)}`
                  : `Moyenne de tes ${t.last.sameCount} derniers ${t.last.weekday}s : ${eur(t.last.sameAvg)}`
                : `Dès ${t.last.weekday} prochain, tu verras si c'est mieux ou moins bien.`}
              {t.last.avgTicket !== null && ` · ticket moyen ${eur2(t.last.avgTicket)} (${t.last.tickets} tickets)`}
            </p>
          </div>

          {/* La semaine */}
          {t.week && (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-paper px-4 py-3">
              <div>
                <p className="text-[12.5px] text-ink-muted">{t.week.complete ? "La semaine dernière" : "Cette semaine, jusqu'à hier"}</p>
                <p className="font-brand-display text-[20px] font-extrabold tabular-nums text-ink">
                  {eur(t.week.total)}{" "}
                  <span className="font-sans text-[12.5px] font-medium text-ink-muted">
                    sur {t.week.days} jour{t.week.days > 1 ? "s" : ""}
                  </span>
                </p>
              </div>
              {t.week.deltaPct !== null && (
                <p className="text-right text-[12.5px] text-ink-muted">
                  <strong className={`block text-[15px] tabular-nums ${t.week.deltaPct >= 0 ? "text-boost-olive-dark" : "text-ink"}`}>
                    {signed(t.week.deltaPct)}
                  </strong>
                  vs la semaine d&apos;avant
                </p>
              )}
            </div>
          )}

          {/* Les 14 derniers jours */}
          <Bars cells={t.cells} />

          {/* La part du programme */}
          {t.program && (
            <div className="mt-4 pt-4 border-t border-paper-border grid grid-cols-2 gap-3">
              <div>
                <p className="font-brand-display text-[24px] font-extrabold tabular-nums text-boost-olive-dark">{t.program.sharePct} %</p>
                <p className="text-[12.5px] text-ink-muted">
                  de ton CA vient des clients du programme ({eur(t.program.revenue)} sur {eur(t.program.total)}, 14 jours)
                </p>
              </div>
              {t.program.captureRatePct !== null && (
                <div>
                  <p className="font-brand-display text-[24px] font-extrabold tabular-nums text-ink">{t.program.captureRatePct} %</p>
                  <p className="text-[12.5px] text-ink-muted">des tickets de caisse sont photographiés par tes clients</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Bars({ cells }: { cells: RevenueTracker["cells"] }) {
  const top = Math.max(1, ...cells.map((c) => c.amount ?? 0));
  return (
    <div className="mt-4">
      <p className="text-[12px] text-ink-faint mb-2">14 derniers jours</p>
      <div className="flex items-end gap-1.5 h-24" role="img" aria-label="Chiffre d'affaires des 14 derniers jours">
        {cells.map((c) => (
          <div key={c.day} className="flex-1 h-full flex flex-col justify-end items-center gap-1">
            {c.amount !== null ? (
              <div
                className={`w-full rounded-t-[3px] ${c.isLast ? "bg-boost-olive" : "bg-boost-light"}`}
                style={{ height: `${Math.max(4, (c.amount / top) * 100)}%` }}
                title={`${dayLabel(c.day)} : ${eur(c.amount)}`}
              />
            ) : (
              <div
                className={`w-full h-[6px] rounded-[2px] ${c.closed ? "bg-paper-border" : "border border-dashed border-paper-border"}`}
                title={`${dayLabel(c.day)} : ${c.closed ? "fermé" : "pas noté"}`}
              />
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 mt-1.5" aria-hidden="true">
        {cells.map((c) => (
          <span key={c.day} className={`flex-1 text-center text-[10.5px] ${c.isLast ? "text-ink font-semibold" : "text-ink-faint"}`}>
            {c.letter}
          </span>
        ))}
      </div>
      <p className="flex gap-4 text-[11px] text-ink-faint mt-2" aria-hidden="true">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-[6px] rounded-[2px] bg-paper-border" />
          fermé
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-[6px] rounded-[2px] border border-dashed border-paper-border" />
          pas noté
        </span>
      </p>
    </div>
  );
}

function LockedCard({ notedDays, restaurantId }: { notedDays: number; restaurantId: string }) {
  return (
    <section className="bg-white border border-paper-border rounded-2xl p-5" aria-labelledby="ton-ca-verrou">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl bg-paper-subtle flex items-center justify-center shrink-0" aria-hidden="true">
          <Lock size={18} strokeWidth={2} className="text-ink-muted" />
        </span>
        <div className="min-w-0">
          <h2 id="ton-ca-verrou" className="font-brand-display text-[18px] font-extrabold text-ink">
            Ton chiffre d&apos;affaires, jour par jour
          </h2>
          <p className="text-[13.5px] text-ink-muted mt-1">
            {notedDays > 0 ? `${notedDays} jours déjà notés. ` : ""}
            Chaque jour face aux mêmes jours de la semaine, ta semaine, et la part de ton CA qui vient de tes clients du
            programme. Avec le forfait Croissance.
          </p>
          <RequestPlanButton restaurantId={restaurantId} feature="revenue_tracker" requiredPlan="croissance" className="mt-3" />
        </div>
      </div>
    </section>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
