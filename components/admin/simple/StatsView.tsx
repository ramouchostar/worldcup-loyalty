import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Star } from "@/components/icons";
import { Card, CardRow, ProgressBar, StatusBadge } from "@/components/admin/ui";
import type { PubHomeCard } from "@/lib/ads/home-card";
import { RequestPlanButton } from "@/components/admin/Paywall";
import { StatsPeriodTabs } from "./StatsPeriodTabs";
import { signed, type ClientStats, type RevenueStats, type StatsPeriod } from "@/lib/stats-page";
import { rangeLabel, shortDay, type CaBar, type CaSummary } from "@/lib/revenue-page";
import { ASSISTANTS } from "@/lib/agents/types";
import { isEditableDay } from "@/lib/daily-revenue-entry";
import { dayLabel } from "@/lib/daily-revenue-model";
import type { Block, ChallengeCount, GoogleBlock, MessagesBlock, SocialBlock } from "@/lib/stats-page-data";

// La page « Stats » de la vue simple — maquette validée le 2026-11-14
// (https://claude.ai/artifact/87hGzRBqX2dSW9metwAYCo). Une phrase en clair,
// puis un bloc par question ; le forfait décide de l'ordre (le chiffre
// d'affaires d'abord en Croissance et Pro) et des blocs montrés. Couleurs
// Boosteats fixes (ADR 0054 amendé, ADR 0081) : nuit pour la phrase, olive
// pour les barres, vert `good` pour une hausse, jamais de rouge pour une baisse
// (le rouge est réservé à ce qui est cassé).

export type StatsViewProps = {
  restaurantId: string;
  planLabel: string;
  period: StatsPeriod;
  headline: string;
  clients: Block<ClientStats>;
  revenue: {
    allowed: boolean;
    block: Block<RevenueStats>;
    /** null : le CA est lu dans Belpeople (ADR 0103 amendé), rien à noter ni à corriger ici. */
    noteHref: string | null;
    forecast: { expected: number; low: number; high: number; from: string; to: string } | null;
    /** Aujourd'hui (Bruxelles) — décide quels jours des barres s'ouvrent encore (fenêtre de correction, ADR 0087). */
    today: string;
    /** null en Gratuit : le bloc garde le total et les jours notés seuls. */
    detail: RevenueDetail | null;
  };
  /** null : le forfait ne montre pas ce bloc (Gratuit). */
  dishes: Block<{ name: string; quantity: number }[]> | null;
  dishesHref: string;
  google: Block<GoogleBlock>;
  social: Block<SocialBlock>;
  messages: Block<MessagesBlock>;
  progression: { href: string; line: string };
  /** Le forfait suivant à faire découvrir, sous le bloc qui en dépend. */
  upsell: "croissance" | "pro" | null;
  /** Pro : lien vers les repères du secteur. */
  benchmarksHref: string | null;
  top?: ReactNode;
  todo?: ReactNode;
  /** Les pubs en diffusion ou en pause (lib/ads/home-card.ts) ; vide = pas d'encart. */
  pub?: PubHomeCard[];
  bottom?: ReactNode;
};

const eur = (n: number) => n.toLocaleString("fr-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const num = (n: number) => n.toLocaleString("fr-BE");

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-[17px] font-bold text-ink">{children}</h2>;
}

function Unavailable({ what }: { what: string }) {
  return (
    <Card>
      <p className="text-[13.5px] text-ink-muted">
        {what} : lecture impossible pour l&apos;instant. Recharge la page dans quelques minutes ; si ça dure, dis-le-nous.
      </p>
    </Card>
  );
}

function Tile({ label, value, sub, good }: { label: string; value: ReactNode; sub?: ReactNode; good?: boolean }) {
  return (
    <div className="bg-white border border-paper-border rounded-xl p-4 flex flex-col gap-1">
      <span className="text-[13px] text-ink-muted">{label}</span>
      <strong className="font-display text-[28px] leading-tight font-bold text-ink tabular-nums">{value}</strong>
      {sub && <span className={`text-[13px] ${good ? "text-good font-semibold" : "text-ink-muted"}`}>{sub}</span>}
    </div>
  );
}

function Upsell({ restaurantId, plan, text }: { restaurantId: string; plan: "croissance" | "pro"; text: string }) {
  return (
    <div className="bg-boost-cream rounded-xl p-4 flex flex-col gap-2">
      <span className="text-[12px] font-bold uppercase tracking-[0.04em] text-boost-olive-dark">
        Avec {plan === "croissance" ? "Croissance" : "Pro"}
      </span>
      <p className="text-[14.5px] leading-snug text-ink">{text}</p>
      <RequestPlanButton
        restaurantId={restaurantId}
        feature={plan === "croissance" ? "revenue_tracker" : "sector_benchmarks"}
        requiredPlan={plan}
        className="self-start min-h-[44px] px-4 rounded-lg bg-boost-olive text-white text-[13.5px] font-semibold hover:bg-boost-olive-dark transition-colors"
      />
    </div>
  );
}

// ── Blocs ─────────────────────────────────────────────────────────────────

// « Ta pub » — maquette validée le 2026-11-14 (https://claude.ai/artifact/BoJGNvQinHZVJMorWpiAyC).
// Seulement quand une pub tourne ; le détail, la recharge et la pause restent sur la page Pub.
function PubSection({ cards }: { cards: PubHomeCard[] }) {
  return (
    <section className="space-y-3" aria-labelledby="stats-pub">
      <div className="flex items-baseline justify-between gap-3">
        <SectionTitle>
          <span id="stats-pub">Ta pub</span>
        </SectionTitle>
        <Link href={cards[0].href} className="inline-flex items-center gap-1 min-h-[44px] text-[14px] font-semibold text-boost-olive-dark hover:text-ink">
          Détail <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
      {cards.map((c) => (
        <Card key={c.id} className="space-y-3.5">
          <div className="flex items-center gap-3">
            <div className="h-[70px] w-14 shrink-0 overflow-hidden rounded-lg border border-paper-border bg-paper-subtle">
              {c.thumbnail && <img src={c.thumbnail} alt="" className="h-full w-full object-cover" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-ink">{c.title}</p>
              {c.where && <p className="text-[13px] text-ink-muted">{c.where}</p>}
            </div>
            <StatusBadge tone={c.statusTone} solid={c.statusTone === "good"} className="shrink-0">{c.statusLabel}</StatusBadge>
          </div>
          <div className="rounded-lg bg-boost-cream px-3.5 py-3">
            <strong className="block font-display text-[28px] leading-tight font-bold tabular-nums text-ink">{num(c.results)}</strong>
            <span className="text-[13px] text-boost-olive-dark">{c.resultLine}</span>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between gap-2 text-[14px] text-ink">
              <span>Dépensé <strong>{eur(c.spentCents / 100)}</strong> sur {eur(c.paidCents / 100)}</span>
              <span className="text-ink-muted">reste {eur(c.remainingCents / 100)}</span>
            </div>
            <ProgressBar value={c.spentCents} max={Math.max(1, c.paidCents)} tone="boost" label="Budget de la pub dépensé" />
          </div>
          {c.keyword && (
            <p className="rounded-lg bg-paper-subtle px-3 py-2.5 text-[13.5px] leading-snug text-ink">
              Mot clé <span className="rounded-md bg-ink px-1.5 py-0.5 text-[12.5px] font-semibold tracking-[0.04em] text-white">{c.keyword}</span> : demande à ton équipe de compter les clients qui le disent au comptoir.
            </p>
          )}
        </Card>
      ))}
    </section>
  );
}

function ClientsSection({ block, period }: { block: Block<ClientStats>; period: StatsPeriod }) {
  if (!block.ok) return <Unavailable what="Tes clients" />;
  const c = block.data;
  const vs = period.compareName ? ` vs ${period.compareName}` : "";
  return (
    <section className="space-y-3" aria-labelledby="stats-clients">
      <SectionTitle>
        <span id="stats-clients">Tes clients</span>
      </SectionTitle>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <Tile
          label="Tickets reçus"
          value={num(c.tickets)}
          sub={c.ticketsDelta !== null ? `${signed(c.ticketsDelta)}${vs}` : undefined}
          good={(c.ticketsDelta ?? 0) > 0}
        />
        <Tile
          label="Clients venus"
          value={num(c.clients)}
          sub={c.newClients > 0 ? `dont ${num(c.newClients)} nouveau${c.newClients > 1 ? "x" : ""}` : undefined}
        />
        <Tile
          label="Revenus 2 fois ou plus"
          value={c.returningPct !== null ? `${c.returningPct} %` : "—"}
          sub={
            c.returningDeltaPts !== null
              ? c.returningDeltaPts === 0
                ? "stable"
                : `${signed(c.returningDeltaPts)} point${Math.abs(c.returningDeltaPts) > 1 ? "s" : ""}`
              : undefined
          }
          good={(c.returningDeltaPts ?? 0) > 0}
        />
        <Tile label="Cadeaux récupérés" value={num(c.giftsRedeemed)} sub="au comptoir" />
      </div>
    </section>
  );
}

/** Le bloc CA revu (maquette validée le 2026-11-15) — calculs dans lib/revenue-page.ts. */
export type RevenueDetail = {
  href: string;
  lastRead: string | null;
  /** Lu dans la caisse (Belpeople) : rien à saisir ni à corriger ici. */
  fromPos: boolean;
  summary: CaSummary | null;
  bars: CaBar[];
  takeaways: string[];
};

function Bars({ bars, restaurantId, today, editable, detailHref }: { bars: CaBar[]; restaurantId: string; today: string; editable: boolean; detailHref: string }) {
  if (bars.length === 0) return null;
  const max = Math.max(1, ...bars.map((b) => b.amount ?? 0));
  // Au-delà de ~6 semaines, les barres deviennent des traits : on n'en garde que les 42 dernières.
  const shown = bars.slice(-42);
  const value = (b: CaBar) => (b.amount !== null ? eur(b.amount) : b.status === "closed" ? "fermé" : b.status === "pending" ? "pas encore lu" : "pas noté");
  const bar = (b: CaBar) => (
    <span
      className={`block w-full rounded-[3px] ${b.amount === null ? "bg-paper-border" : b.best ? "bg-boost-olive" : "bg-boost-light"}`}
      style={{ height: b.amount === null ? "8%" : `${Math.max(8, Math.round((b.amount / max) * 100))}%` }}
    />
  );
  const pending = shown.some((b) => b.status === "pending");
  return (
    <div className="space-y-1.5">
      <div className="flex items-end gap-[3px] h-20">
        {shown.map((b) => {
          // Saisie : un jour encore corrigeable s'ouvre d'un appui (ADR 0087). Caisse lue : la page détail.
          const href = editable && isEditableDay(b.day, today) ? `/admin/${restaurantId}/ca/${b.day}` : detailHref;
          return (
            <Link
              key={b.day}
              href={href}
              aria-label={`${dayLabel(b.day)} : ${value(b)}${href === detailHref ? " — voir le détail" : " — voir ou corriger"}`}
              className="flex-1 h-full flex flex-col justify-end rounded-[4px] hover:bg-paper-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink/40"
            >
              {bar(b)}
            </Link>
          );
        })}
      </div>
      {shown.length <= 16 ? (
        <div className="flex gap-[3px]" aria-hidden="true">
          {shown.map((b) => (
            <span key={b.day} className="flex-1 flex flex-col items-center text-[11px] leading-[13px] text-ink-muted tabular-nums">
              <span>{b.letter}</span>
              <span className="font-semibold text-ink">{b.num}</span>
            </span>
          ))}
        </div>
      ) : (
        <div className="flex justify-between text-[13px] text-ink-muted" aria-hidden="true">
          <span>{shortDay(shown[0].day)}</span>
          <span>{shortDay(shown[shown.length - 1].day)}</span>
        </div>
      )}
      <div className="flex gap-x-4 gap-y-1 flex-wrap text-[13px] text-ink-muted pt-0.5">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-[2px] bg-boost-olive" aria-hidden="true" />
          Meilleur jour
        </span>
        {pending && (
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-[2px] bg-paper-border" aria-hidden="true" />
            Pas encore lu dans ta caisse
          </span>
        )}
      </div>
    </div>
  );
}

function RevenueSection({ restaurantId, revenue, upsell, period }: { restaurantId: string; revenue: StatsViewProps["revenue"]; upsell: boolean; period: StatsPeriod }) {
  const r = revenue.block.ok ? revenue.block.data : null;
  const d = revenue.allowed ? revenue.detail : null;
  const s = d?.summary ?? null;
  const range = (x: { from: string; to: string }) => rangeLabel(x);
  return (
    <section className="space-y-3" aria-labelledby="stats-ca">
      <div className="flex items-baseline justify-between gap-3">
        <SectionTitle>
          <span id="stats-ca">Ton chiffre d&apos;affaires</span>
        </SectionTitle>
        <span className="text-[13px] text-ink-muted">{period.label}</span>
      </div>
      {!revenue.block.ok ? (
        <Unavailable what="Ton chiffre d'affaires" />
      ) : d ? (
        <Card className="space-y-3.5">
          {s ? (
            <div className="space-y-0.5">
              <p className="text-[13px] text-ink-muted first-letter:uppercase">{range(s.window)}</p>
              <div className="flex items-baseline justify-between gap-3">
                <strong className="font-display text-[32px] font-bold text-ink tabular-nums">{eur(s.total)}</strong>
                {s.compare && (
                  <span className={`text-[15px] font-semibold ${s.compare.changePct > 0 ? "text-good" : "text-ink-muted"}`}>
                    {s.compare.changePct > 0 ? "+" : s.compare.changePct < 0 ? "−" : ""}
                    {Math.abs(s.compare.changePct)} %
                  </span>
                )}
              </div>
              <p className="text-[13px] text-ink-muted">
                {eur(s.avgPerDay)} par jour
                {s.compare ? ` · contre ${eur(s.compare.avgPerDay)} ${range(s.compare.window)}` : ""}
              </p>
            </div>
          ) : (
            <p className="text-[15px] text-ink-muted">Aucun jour lu sur cette période pour le moment.</p>
          )}

          <Bars bars={d.bars} restaurantId={restaurantId} today={revenue.today} editable={!d.fromPos && revenue.noteHref !== null} detailHref={d.href} />

          {s && (s.best || s.programSharePct != null) && (
            <div className="space-y-2.5 border-t border-paper-border pt-3 text-[15px] text-ink">
              {s.best && (
                <div className="flex justify-between gap-3">
                  <span>Meilleur jour</span>
                  <strong className="text-right">{shortDay(s.best.day)} · {eur(s.best.amount)}</strong>
                </div>
              )}
              {s.calmest && (
                <div className="flex justify-between gap-3">
                  <span>Jour le plus calme</span>
                  <strong className="text-right">{shortDay(s.calmest.day)} · {eur(s.calmest.amount)}</strong>
                </div>
              )}
              {s.programSharePct != null && (
                <div className="flex justify-between gap-3">
                  <span>Part venue des clients du programme</span>
                  <strong className="tabular-nums">{s.programSharePct} %</strong>
                </div>
              )}
            </div>
          )}

          {revenue.forecast && (
            <div className="flex justify-between gap-3 bg-boost-cream rounded-lg p-3 text-[15px] text-ink">
              <span>Prévu {range(revenue.forecast)}</span>
              <strong className="tabular-nums text-right">
                {eur(revenue.forecast.expected)}
                <span className="block text-[13px] font-normal text-ink-muted">
                  entre {eur(revenue.forecast.low)} et {eur(revenue.forecast.high)}
                </span>
              </strong>
            </div>
          )}

          {d.takeaways.length > 0 && (
            <div className="border border-paper-border rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2.5">
                <img src={ASSISTANTS.chloe.photo} alt="" width={32} height={32} className="h-8 w-8 rounded-full object-cover" />
                <span className="flex flex-col leading-tight">
                  <strong className="text-[13px] text-ink">{ASSISTANTS.chloe.name} a remarqué</strong>
                  <span className="text-[13px] text-ink-muted">{ASSISTANTS.chloe.post}</span>
                </span>
              </div>
              {d.takeaways.map((t) => (
                <p key={t} className="text-[15px] leading-snug text-ink">
                  {t}
                </p>
              ))}
            </div>
          )}

          {d.lastRead && d.fromPos && (
            <p className="text-[13px] text-ink-muted">Lu dans ta caisse jusqu&apos;au {dayLabel(d.lastRead)} : ta caisse donne ses chiffres une semaine après.</p>
          )}

          <Link
            href={d.href}
            className="min-h-[44px] flex items-center justify-center gap-1.5 rounded-lg bg-ink text-white text-[15px] font-semibold hover:bg-ink/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Voir le détail et les prévisions <ArrowRight size={16} aria-hidden="true" />
          </Link>
          {revenue.noteHref && (
            <Link href={revenue.noteHref} className="min-h-[44px] inline-flex items-center gap-1 text-[15px] font-semibold text-boost-olive-dark hover:underline">
              Noter le chiffre d&apos;hier <ArrowRight size={15} aria-hidden="true" />
            </Link>
          )}
        </Card>
      ) : (
        <Card className="space-y-3">
          {/* Gratuit (maquette du 2026-11-14) : total et jours notés seuls. */}
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <strong className="font-display text-[26px] font-bold text-ink tabular-nums">
              {r && r.notedDays > 0 ? eur(r.total) : "Pas encore noté"}
            </strong>
            {r && (
              <span className="text-[13px] text-ink-muted">
                {r.notedDays} jour{r.notedDays > 1 ? "s" : ""} noté{r.notedDays > 1 ? "s" : ""} sur {r.elapsedDays}
              </span>
            )}
          </div>
          {revenue.noteHref && (
            <Link href={revenue.noteHref} className="min-h-[44px] inline-flex items-center gap-1 text-[14px] font-semibold text-boost-olive-dark hover:underline">
              Noter le chiffre d&apos;hier <ArrowRight size={15} aria-hidden="true" />
            </Link>
          )}
        </Card>
      )}
      {upsell && (
        <Upsell
          restaurantId={restaurantId}
          plan="croissance"
          text="Ton chiffre jour par jour, comparé aux mêmes jours, tes heures de pointe et ce que tu vas faire ce mois-ci."
        />
      )}
    </section>
  );
}

function DishesSection({ block, href }: { block: Block<{ name: string; quantity: number }[]>; href: string }) {
  return (
    <section className="space-y-3" aria-labelledby="stats-plats">
      <SectionTitle>
        <span id="stats-plats">Ce qui se vend</span>
      </SectionTitle>
      {!block.ok ? (
        <Unavailable what="Ce qui se vend" />
      ) : block.data.length === 0 ? (
        <Card>
          <p className="text-[13.5px] text-ink-muted">Aucun plat lu sur les tickets de la période.</p>
        </Card>
      ) : (
        <Card padding="p-0">
          {block.data.map((d, i) => (
            <CardRow key={d.name} first={i === 0} className="flex justify-between gap-3 text-[14.5px] text-ink">
              <span className="min-w-0 truncate">
                {i + 1}. {d.name}
              </span>
              <strong className="shrink-0 tabular-nums">
                {num(d.quantity)} vendu{d.quantity > 1 ? "s" : ""}
              </strong>
            </CardRow>
          ))}
        </Card>
      )}
      <Link href={href} className="min-h-[44px] inline-flex items-center gap-1 text-[14px] font-semibold text-boost-olive-dark hover:underline">
        Tous les plats et ta marge <ArrowRight size={15} aria-hidden="true" />
      </Link>
    </section>
  );
}

/** « +3 ce mois » sous un total de défis ; rien pour « depuis le début » (le total dit tout). */
function challengeDelta(c: ChallengeCount, period: StatsPeriod): string | null {
  if (period.key === "debut") return null;
  return `+${num(c.inPeriod)} ${period.key === "mois" ? "ce mois" : period.label}`;
}

function GoogleSection({ block, period }: { block: Block<GoogleBlock>; period: StatsPeriod }) {
  if (!block.ok) return <Unavailable what="Ta réputation sur Google" />;
  const g = block.data;
  const delta = challengeDelta(g.reviews, period);
  return (
    <section className="space-y-3" aria-labelledby="stats-google">
      <SectionTitle>
        <span id="stats-google">Ta réputation sur Google</span>
      </SectionTitle>
      <Card className="space-y-3">
        {/* Le défi « avis Google » de l'appli : le chiffre que le programme apporte. */}
        <div className="flex items-end justify-between gap-3">
          <span className="flex flex-col">
            <span className="text-[15px] font-semibold text-ink">Avis laissés par tes clients</span>
            <span className="text-[13px] text-ink-muted">membres qui ont fait le défi « avis Google » dans l&apos;appli</span>
          </span>
          <span className="flex flex-col items-end shrink-0">
            <strong className="font-display text-[30px] leading-none font-bold text-ink tabular-nums">{num(g.reviews.total)}</strong>
            {delta && <span className="text-[13px] text-ink-muted tabular-nums mt-1">{delta}</span>}
          </span>
        </div>
        <div className="pt-3 border-t border-paper-border">
          {g.rating ? (
            <div className="flex items-center gap-2 text-[14px] text-ink-muted">
              <Star size={15} className="text-warn shrink-0" />
              <span>
                Note Google{" "}
                <strong className="text-ink tabular-nums">
                  {g.rating.rating.toLocaleString("fr-BE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                </strong>{" "}
                · {num(g.rating.count)} avis au total
              </span>
            </div>
          ) : (
            <p className="text-[13px] text-ink-muted">
              {g.ratingFailed
                ? "La note Google n'a pas pu être lue pour l'instant."
                : "Ta fiche Google n'est pas encore reliée à ton établissement : dis-le-nous, on s'en charge."}
            </p>
          )}
        </div>
      </Card>
    </section>
  );
}

function SocialSection({ block, period }: { block: Block<SocialBlock>; period: StatsPeriod }) {
  if (!block.ok) return <Unavailable what="Tes réseaux" />;
  if (block.data.networks.length === 0) return null;
  return (
    <section className="space-y-3" aria-labelledby="stats-reseaux">
      <SectionTitle>
        <span id="stats-reseaux">Tes réseaux</span>
      </SectionTitle>
      <Card padding="p-0">
        {block.data.networks.map((n, i) => {
          const delta = challengeDelta(n.follows, period);
          return (
            <CardRow key={n.key} first={i === 0} className="flex items-center justify-between gap-3">
              <span className="flex flex-col">
                <span className="text-[15px] font-semibold text-ink">{n.label}</span>
                <span className="text-[13px] text-ink-muted">
                  membre{n.follows.total > 1 ? "s" : ""} abonné{n.follows.total > 1 ? "s" : ""} par le défi de l&apos;appli
                </span>
              </span>
              <span className="flex flex-col items-end shrink-0">
                <strong className="font-display text-[22px] leading-none font-bold text-ink tabular-nums">{num(n.follows.total)}</strong>
                {delta && <span className="text-[12.5px] text-ink-muted tabular-nums mt-1">{delta}</span>}
              </span>
            </CardRow>
          );
        })}
      </Card>
    </section>
  );
}

function MessagesSection({ block, period }: { block: Block<MessagesBlock>; period: StatsPeriod }) {
  if (!block.ok) return <Unavailable what="Tes messages aux clients" />;
  const m = block.data;
  const when = period.key === "mois" ? "ce mois" : period.key === "mois-dernier" ? period.label : "depuis le début";
  return (
    <section className="space-y-3" aria-labelledby="stats-messages">
      <SectionTitle>
        <span id="stats-messages">Tes messages aux clients</span>
      </SectionTitle>
      <Card className="space-y-3.5">
        <span className="block text-[15px] font-semibold text-ink">E-mails</span>
        <div className="grid grid-cols-3 gap-2">
          {[
            [m.emailsSent, "envoyés"],
            [m.emailsDelivered, "bien arrivés"],
            [m.emailsClicked, "cliqués"],
          ].map(([v, l]) => (
            <div key={l as string} className="flex flex-col">
              <strong className="font-display text-[24px] font-bold text-ink tabular-nums">{num(v as number)}</strong>
              <span className="text-[13px] text-ink-muted">{l}</span>
            </div>
          ))}
        </div>
        <div className="h-px bg-paper-border" />
        <span className="block text-[15px] font-semibold text-ink">Notifications sur le téléphone</span>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col">
            <strong className="font-display text-[24px] font-bold text-ink tabular-nums">{num(m.pushReachable)}</strong>
            <span className="text-[13px] text-ink-muted">client{m.pushReachable > 1 ? "s" : ""} les reçoi{m.pushReachable > 1 ? "vent" : "t"}</span>
          </div>
          <div className="flex flex-col">
            <strong className="font-display text-[24px] font-bold text-ink tabular-nums">{num(m.announcements)}</strong>
            <span className="text-[13px] text-ink-muted">
              annonce{m.announcements > 1 ? "s" : ""} envoyée{m.announcements > 1 ? "s" : ""} {when}
            </span>
          </div>
        </div>
      </Card>
    </section>
  );
}

// ── La page ─────────────────────────────────────────────────────────────────

export function StatsView(p: StatsViewProps) {
  const revenueFirst = p.revenue.allowed;
  const clients = <ClientsSection block={p.clients} period={p.period} />;
  const revenue = <RevenueSection restaurantId={p.restaurantId} revenue={p.revenue} upsell={p.upsell === "croissance"} period={p.period} />;

  return (
    <div className="space-y-7">
      {p.top}

      <header className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-[28px] md:text-[36px] font-bold tracking-[-0.01em] text-ink">Tes stats</h1>
          <span className="text-[12px] font-semibold px-2.5 py-1 rounded-full bg-boost-cream text-boost-olive-dark">{p.planLabel}</span>
        </div>
        <StatsPeriodTabs value={p.period.key} />
      </header>

      <div className="bg-boost-night text-boost-cream rounded-2xl p-5 md:px-7 md:py-6 space-y-2">
        <p className="text-[19px] md:text-[23px] leading-snug font-semibold">{p.headline}</p>
        <p className="text-[13px] text-boost-light">
          {p.period.label.charAt(0).toUpperCase() + p.period.label.slice(1)}
          {p.period.compareName ? `, comparé aux mêmes jours de ${p.period.compareName}` : ""}
        </p>
      </div>

      {p.todo}

      {p.pub && p.pub.length > 0 && <PubSection cards={p.pub} />}

      {revenueFirst ? (
        <>
          {revenue}
          {clients}
        </>
      ) : (
        <>
          {clients}
          {revenue}
        </>
      )}

      <div className="grid gap-7 md:grid-cols-2 md:items-start">
        {p.dishes && <DishesSection block={p.dishes} href={p.dishesHref} />}
        <GoogleSection block={p.google} period={p.period} />
        <SocialSection block={p.social} period={p.period} />
        <MessagesSection block={p.messages} period={p.period} />
      </div>

      {p.benchmarksHref && (
        <Link
          href={p.benchmarksHref}
          className="flex items-center justify-between gap-3 bg-white border border-paper-border rounded-xl px-5 py-4 min-h-[44px] hover:bg-paper transition-colors"
        >
          <span className="flex flex-col">
            <span className="text-[15px] font-semibold text-ink">Toi face au secteur</span>
            <span className="text-[13px] text-ink-muted">Tes repères comparés aux restaurants autour de toi</span>
          </span>
          <ArrowRight size={18} className="text-ink-faint shrink-0" aria-hidden="true" />
        </Link>
      )}

      {p.upsell === "pro" && (
        <Upsell restaurantId={p.restaurantId} plan="pro" text="Toi face aux restaurants de ton secteur, et un point chaque mois avec notre équipe." />
      )}

      <Link
        href={p.progression.href}
        className="flex items-center justify-between gap-3 bg-white border border-paper-border rounded-xl px-5 py-4 min-h-[44px] hover:bg-paper transition-colors"
      >
        <span className="flex flex-col">
          <span className="text-[15px] font-semibold text-ink">Ta progression</span>
          <span className="text-[13px] text-ink-muted">{p.progression.line}</span>
        </span>
        <ArrowRight size={18} className="text-ink-faint shrink-0" aria-hidden="true" />
      </Link>

      {p.bottom}
    </div>
  );
}
