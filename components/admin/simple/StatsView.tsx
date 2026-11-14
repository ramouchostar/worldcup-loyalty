import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Star } from "@/components/icons";
import { Card, CardRow } from "@/components/admin/ui";
import { RequestPlanButton } from "@/components/admin/Paywall";
import { StatsPeriodTabs } from "./StatsPeriodTabs";
import { signed, type ClientStats, type RevenueStats, type StatsPeriod } from "@/lib/stats-page";
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
    noteHref: string;
    forecast: { expected: number; low: number; high: number } | null;
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

function Bars({ bars }: { bars: RevenueStats["bars"] }) {
  if (bars.length === 0) return null;
  const max = Math.max(1, ...bars.map((b) => b.amount ?? 0));
  // Au-delà de ~6 semaines, les barres deviennent des traits : on n'en garde que les 42 dernières.
  const shown = bars.slice(-42);
  return (
    <div className="flex items-end gap-[3px] h-16" aria-hidden="true">
      {shown.map((b) => (
        <span
          key={b.day}
          className={`flex-1 rounded-[3px] ${b.amount === null ? "bg-paper-border" : b.amount >= max * 0.9 ? "bg-boost-olive" : "bg-boost-light"}`}
          style={{ height: b.amount === null ? "8%" : `${Math.max(8, Math.round((b.amount / max) * 100))}%` }}
        />
      ))}
    </div>
  );
}

function RevenueSection({ restaurantId, revenue, upsell }: { restaurantId: string; revenue: StatsViewProps["revenue"]; upsell: boolean }) {
  const r = revenue.block.ok ? revenue.block.data : null;
  return (
    <section className="space-y-3" aria-labelledby="stats-ca">
      <SectionTitle>
        <span id="stats-ca">Ton chiffre d&apos;affaires</span>
      </SectionTitle>
      {!revenue.block.ok ? (
        <Unavailable what="Ton chiffre d'affaires" />
      ) : (
        <Card className="space-y-3">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <strong className="font-display text-[26px] font-bold text-ink tabular-nums">
              {r && r.notedDays > 0 ? eur(r.total) : "Pas encore noté"}
            </strong>
            {revenue.allowed && r?.changePct != null ? (
              <span className={`text-[14px] font-semibold ${r.changePct > 0 ? "text-good" : "text-ink-muted"}`}>
                {r.changePct > 0 ? "+" : r.changePct < 0 ? "−" : ""}
                {Math.abs(r.changePct)} % vs mêmes jours
              </span>
            ) : (
              r && (
                <span className="text-[13px] text-ink-muted">
                  {r.notedDays} jour{r.notedDays > 1 ? "s" : ""} noté{r.notedDays > 1 ? "s" : ""} sur {r.elapsedDays}
                </span>
              )
            )}
          </div>
          {/* Le jour par jour est une fonction Croissance (maquette Gratuit : total et jours notés seuls). */}
          {revenue.allowed && r && r.notedDays > 0 && <Bars bars={r.bars} />}
          {r && r.notedDays > 0 && (
            <p className="sr-only">
              {r.notedDays} jours notés sur {r.elapsedDays} jours écoulés de la période.
            </p>
          )}
          {revenue.allowed && r?.programSharePct != null && (
            <div className="pt-3 border-t border-paper-border space-y-1.5">
              <div className="flex justify-between text-[14.5px] text-ink">
                <span>Part venue des clients du programme</span>
                <strong className="tabular-nums">{r.programSharePct} %</strong>
              </div>
              <div className="h-2 rounded bg-paper-subtle overflow-hidden" aria-hidden="true">
                <span className="block h-full bg-boost-olive rounded" style={{ width: `${r.programSharePct}%` }} />
              </div>
            </div>
          )}
          {revenue.allowed && revenue.forecast && (
            <div className="flex justify-between gap-3 text-[14.5px] text-ink">
              <span>Prévu ces 7 prochains jours</span>
              <strong className="tabular-nums text-right">
                {eur(revenue.forecast.expected)}
                <span className="block text-[12px] font-normal text-ink-muted">
                  entre {eur(revenue.forecast.low)} et {eur(revenue.forecast.high)}
                </span>
              </strong>
            </div>
          )}
          <Link href={revenue.noteHref} className="min-h-[44px] inline-flex items-center gap-1 text-[14px] font-semibold text-boost-olive-dark hover:underline">
            Noter le chiffre d&apos;hier <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </Card>
      )}
      {upsell && (
        <Upsell
          restaurantId={restaurantId}
          plan="croissance"
          text="Ton chiffre jour par jour, comparé aux mêmes jours, et la part qui vient de tes clients du programme."
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
  const revenue = <RevenueSection restaurantId={p.restaurantId} revenue={p.revenue} upsell={p.upsell === "croissance"} />;

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
