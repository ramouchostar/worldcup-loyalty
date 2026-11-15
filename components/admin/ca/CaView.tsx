import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "@/components/icons";
import { Card } from "@/components/admin/ui";
import { ASSISTANTS } from "@/lib/agents/types";
import {
  WEEK_ORDER,
  listDay,
  longDay,
  rangeLabel,
  shortDay,
  weekdayName,
  type CaBar,
  type CaDay,
  type CaSummary,
  type ChannelMix,
  type HourGrid,
  type MonthProjection,
  type Tip,
  type WeekType,
} from "@/lib/revenue-page";
import { isEditableDay } from "@/lib/daily-revenue-entry";

// La page « Chiffre d'affaires » — maquette validée par Mehdi le 2026-11-15
// (https://claude.ai/artifact/BpMKiqkWJ3DppGeXxX6dzE). Couleurs Boosteats fixes
// (ADR 0054 amendé) : olive pour les barres, nuit pour le rush, vert `good`
// pour une hausse, jamais de rouge pour une baisse.

export const eur = (n: number) => n.toLocaleString("fr-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)} %`;

export function SectionTitle({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2 id={id} className="text-[17px] font-bold text-ink">
      {children}
    </h2>
  );
}

export function Unavailable({ what }: { what: string }) {
  return (
    <Card>
      <p className="text-[15px] text-ink-muted">{what} : lecture impossible pour le moment. Réessaie dans un instant.</p>
    </Card>
  );
}

function Portrait({ id, size }: { id: "chloe" | "hugo" | "lea"; size: number }) {
  return <img src={ASSISTANTS[id].photo} alt="" width={size} height={size} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />;
}

/** « Chloé a remarqué · Suit les chiffres » — l'en-tête de chaque remarque. */
export function FromChloe() {
  return (
    <div className="flex items-center gap-2.5">
      <Portrait id="chloe" size={36} />
      <span className="flex flex-col leading-tight">
        <strong className="text-[13px] text-ink">{ASSISTANTS.chloe.name} a remarqué</strong>
        <span className="text-[13px] text-ink-muted">{ASSISTANTS.chloe.post}</span>
      </span>
    </div>
  );
}

// ── Résumé ──────────────────────────────────────────────────────────────────

export function SummaryCard({ s }: { s: CaSummary }) {
  return (
    <Card className="space-y-3">
      <p className="text-[13px] text-ink-muted">
        {rangeLabel(s.window).replace(/^du /, "Du ").replace(/^le /, "Le ")} · {s.notedDays} jour{s.notedDays > 1 ? "s" : ""} lu{s.notedDays > 1 ? "s" : ""}
      </p>
      <div className="flex items-baseline justify-between gap-3">
        <strong className="font-display text-[32px] font-bold text-ink tabular-nums">{eur(s.total)}</strong>
        {s.compare && (
          <span className={`text-[15px] font-semibold ${s.compare.changePct > 0 ? "text-good" : "text-ink-muted"}`}>{signed(s.compare.changePct)}</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="bg-paper-subtle rounded-lg p-3 space-y-0.5">
          <p className="text-[13px] text-ink-muted">Par jour</p>
          <p className="text-[17px] font-bold text-ink tabular-nums">{eur(s.avgPerDay)}</p>
          {s.compare && <p className="text-[13px] text-ink-muted">{eur(s.compare.avgPerDay)} {rangeLabel(s.compare.window)}</p>}
        </div>
        {s.orders !== null && s.basket !== null && (
          <div className="bg-paper-subtle rounded-lg p-3 space-y-0.5">
            <p className="text-[13px] text-ink-muted">Commandes</p>
            <p className="text-[17px] font-bold text-ink tabular-nums">{s.orders.toLocaleString("fr-BE")}</p>
            <p className="text-[13px] text-ink-muted">panier moyen {s.basket.toFixed(2).replace(".", ",")} €</p>
          </div>
        )}
      </div>
    </Card>
  );
}

// ── Combien tu vas faire ────────────────────────────────────────────────────

export function ProjectionSection({ month, next, lastMonth }: { month: MonthProjection | null; next: MonthProjection | null; lastMonth: { name: string; total: number } | null }) {
  if (!month && !next) return null;
  return (
    <section className="space-y-3" aria-labelledby="ca-combien">
      <SectionTitle id="ca-combien">Combien tu vas faire</SectionTitle>
      <div className="grid grid-cols-2 gap-2.5">
        {month && (
          <div className="bg-ink text-white rounded-xl p-4 space-y-1">
            <p className="text-[13px] text-white/75 first-letter:uppercase">{month.name} (fin du mois)</p>
            <p className="font-display text-[24px] font-bold tabular-nums">≈ {eur(month.expected)}</p>
            <p className="text-[13px] text-white/75 tabular-nums">
              entre {eur(month.low)} et {eur(month.high)}
            </p>
            {lastMonth && (
              <p className="text-[13px] text-white/75 first-letter:uppercase">
                {lastMonth.name} : {eur(lastMonth.total)}
              </p>
            )}
          </div>
        )}
        {next && (
          <div className="bg-white border border-paper-border rounded-xl p-4 space-y-1">
            <p className="text-[13px] text-ink-muted first-letter:uppercase">{next.name}</p>
            <p className="font-display text-[24px] font-bold text-ink tabular-nums">≈ {eur(next.expected)}</p>
            <p className="text-[13px] text-ink-muted tabular-nums">
              entre {eur(next.low)} et {eur(next.high)}
            </p>
            {next.holidays.length > 0 && (
              <p className="text-[13px] text-ink-muted">
                sans compter {next.holidays.length > 1 ? "les jours fériés" : "le jour férié"} ({next.holidays.map((d) => shortDay(d)).join(", ")})
              </p>
            )}
          </div>
        )}
      </div>
      <p className="text-[13px] text-ink-muted">
        C&apos;est ton chiffre d&apos;affaires (ce qui rentre en caisse), pas ton bénéfice. Calculé sur les jours déjà lus, puis sur tes mêmes jours de semaine des 8 dernières semaines.
      </p>
    </section>
  );
}

// ── Ce qu'il faut retenir ───────────────────────────────────────────────────

export function TipCard({ tip }: { tip: Tip }) {
  return (
    <Card padding="p-4" className="space-y-2">
      <FromChloe />
      <p className="text-[15px] font-semibold text-ink leading-snug">{tip.title}</p>
      <p className="text-[15px] text-ink-body leading-relaxed">{tip.body}</p>
      <p className="bg-boost-cream rounded-lg px-3 py-2 text-[13px] text-ink">
        <span className="font-bold text-boost-olive-dark">À faire : </span>
        {tip.todo}
      </p>
      {tip.helper && (
        <div className="flex items-center gap-2 text-[13px] text-ink-body">
          <Portrait id={tip.helper.id} size={24} />
          <span>{tip.helper.text}</span>
        </div>
      )}
      {tip.link && (
        <Link href={tip.link.href} className="min-h-[44px] inline-flex items-center gap-1.5 text-[15px] font-semibold text-boost-olive-dark hover:underline">
          {tip.link.label}
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      )}
    </Card>
  );
}

// ── Jour par jour ───────────────────────────────────────────────────────────

export function DayBars({ bars, compareAvg, compareName, height = "h-32" }: { bars: CaBar[]; compareAvg: number | null; compareName: string | null; height?: string }) {
  if (bars.length === 0) return null;
  const max = Math.max(1, ...bars.map((b) => b.amount ?? 0), compareAvg ?? 0);
  const shown = bars.slice(-42);
  const pending = shown.some((b) => b.status === "pending");
  return (
    <div className="space-y-2">
      <div className={`relative flex items-end gap-[3px] ${height}`}>
        {shown.map((b) => (
          <span
            key={b.day}
            className={`flex-1 rounded-[3px] ${b.amount === null ? "bg-paper-border" : b.best ? "bg-boost-olive" : "bg-boost-light"}`}
            style={{ height: b.amount === null ? "6%" : `${Math.max(6, Math.round((b.amount / max) * 100))}%` }}
            title={`${shortDay(b.day)} : ${b.amount !== null ? eur(b.amount) : b.status === "closed" ? "fermé" : b.status === "pending" ? "pas encore lu" : "pas noté"}`}
          />
        ))}
        {compareAvg !== null && (
          <span className="absolute inset-x-0 border-t-2 border-dashed border-ink-muted/70 pointer-events-none" style={{ bottom: `${Math.round((compareAvg / max) * 100)}%` }} aria-hidden="true" />
        )}
      </div>
      {shown.length <= 16 && (
        <div className="flex gap-[3px]" aria-hidden="true">
          {shown.map((b) => (
            <span key={b.day} className="flex-1 flex flex-col items-center text-[11px] leading-[13px] text-ink-muted tabular-nums">
              <span>{b.letter}</span>
              <span className="font-semibold text-ink">{b.num}</span>
            </span>
          ))}
        </div>
      )}
      {shown.length > 16 && (
        <div className="flex justify-between text-[13px] text-ink-muted" aria-hidden="true">
          <span>{shortDay(shown[0].day)}</span>
          <span>{shortDay(shown[shown.length - 1].day)}</span>
        </div>
      )}
      <div className="flex gap-x-4 gap-y-1 flex-wrap text-[13px] text-ink-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-[2px] bg-boost-olive" aria-hidden="true" />
          Meilleur jour
        </span>
        {compareAvg !== null && compareName && (
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3.5 border-t-2 border-dashed border-ink-muted/70" aria-hidden="true" />
            Moyenne par jour en {compareName} ({eur(compareAvg)})
          </span>
        )}
        {pending && (
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-[2px] bg-paper-border" aria-hidden="true" />
            Pas encore lu dans ta caisse
          </span>
        )}
      </div>
      <p className="sr-only">
        {shown
          .filter((b) => b.amount !== null)
          .map((b) => `${longDay(b.day)} : ${eur(b.amount as number)}`)
          .join(" ; ")}
      </p>
    </div>
  );
}

// ── Semaine type ────────────────────────────────────────────────────────────

export function WeekTypeSection({ week }: { week: WeekType }) {
  const max = Math.max(1, ...week.days.map((d) => d.avg ?? 0));
  const gapPct =
    week.best && week.weakest ? Math.round((1 - (week.weakest.avg as number) / (week.best.avg as number)) * 100) : null;
  return (
    <section className="space-y-3" aria-labelledby="ca-semaine">
      <div>
        <SectionTitle id="ca-semaine">Ta semaine type</SectionTitle>
        <p className="text-[13px] text-ink-muted">Moyenne par jour {rangeLabel(week.range)}</p>
      </div>
      <Card className="space-y-2.5">
        {week.days.map((d) => {
          const strong = d.weekday === week.best?.weekday || d.weekday === week.weakest?.weekday;
          return (
            <div key={d.weekday} className="grid grid-cols-[84px_1fr_76px] items-center gap-2.5 text-[15px] text-ink">
              <span className={strong ? "font-bold" : ""}>{d.label}</span>
              <span className="h-2.5 rounded-full bg-paper-subtle overflow-hidden" aria-hidden="true">
                <span
                  className={`block h-full rounded-full ${d.weekday === week.best?.weekday ? "bg-ink" : d.weekday === week.weakest?.weekday ? "bg-ink-muted" : "bg-boost-olive"}`}
                  style={{ width: `${Math.round(((d.avg ?? 0) / max) * 100)}%` }}
                />
              </span>
              <strong className="text-right tabular-nums">{d.avg === null ? (d.closedShare >= 0.5 ? "fermé" : "pas assez lu") : eur(d.avg)}</strong>
            </div>
          );
        })}
        {week.weakest && gapPct !== null && gapPct > 0 && (
          <p className="text-[13px] text-ink border-t border-paper-border pt-2.5">
            Le {weekdayName(week.weakest.weekday)} est ton jour le plus calme : {gapPct} % de moins que le {weekdayName(week.best!.weekday)}.
          </p>
        )}
      </Card>
    </section>
  );
}

// ── Heures de pointe ────────────────────────────────────────────────────────

const LEVEL_CLS = ["bg-paper-subtle text-ink-muted", "bg-boost-cream text-ink", "bg-boost-light text-ink", "bg-boost-olive text-white", "bg-ink text-white"];
const WD_HEAD = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

export function HourGridSection({ grid, tip }: { grid: HourGrid; tip: Tip | null }) {
  return (
    <section className="space-y-3" aria-labelledby="ca-heures">
      <div>
        <SectionTitle id="ca-heures">Tes heures de pointe</SectionTitle>
        <p className="text-[13px] text-ink-muted">
          Ce que tu encaisses en moyenne par heure, {rangeLabel(grid.range)}. Plus la case est foncée, plus ça tourne.
        </p>
      </div>
      <Card padding="p-3" className="overflow-x-auto">
        <table className="w-full min-w-[320px] border-separate border-spacing-[3px] text-center tabular-nums">
          <caption className="sr-only">Chiffre d&apos;affaires moyen par heure et par jour de la semaine, en euros</caption>
          <thead>
            <tr>
              <th scope="col" className="w-9" />
              {WEEK_ORDER.map((w) => (
                <th key={w} scope="col" className="text-[11px] font-semibold text-ink-muted">
                  {WD_HEAD[w]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.hours.map((h, i) => (
              <tr key={h}>
                <th scope="row" className="text-[11px] font-normal text-ink-muted text-left">
                  {h} h
                </th>
                {grid.cells[i].map((c) => {
                  const peak = (grid.rush && c.weekday === grid.rush.weekday && inRush(c.hour, grid.rush)) || false;
                  return (
                    <td
                      key={c.weekday}
                      className={`h-7 rounded text-[11px] font-semibold ${LEVEL_CLS[c.level]} ${peak ? "outline outline-2 -outline-offset-2 outline-warn" : ""}`}
                    >
                      {c.avg > 0 ? c.avg : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center gap-1.5 text-[11px] text-ink-muted pt-2 px-1 flex-wrap">
          <span>Calme</span>
          {LEVEL_CLS.map((c, i) => (
            <span key={i} className={`w-[18px] h-2.5 rounded-[2px] ${c.split(" ")[0]}`} aria-hidden="true" />
          ))}
          <span>Rush</span>
          {grid.rush && (
            <span className="inline-flex items-center gap-1.5 ml-2">
              <span className="w-[18px] h-2.5 rounded-[2px] outline outline-2 -outline-offset-2 outline-warn" aria-hidden="true" />
              ton rush
            </span>
          )}
          <span className="ml-auto">en € par heure, TTC</span>
        </div>
      </Card>
      {tip && <TipCard tip={tip} />}
    </section>
  );
}

function inRush(hour: number, rush: { from: number; to: number }): boolean {
  const r = (h: number) => (h + 19) % 24;
  return r(hour) >= r(rush.from) && r(hour) < r(rush.from) + 3;
}

// ── Canaux ──────────────────────────────────────────────────────────────────

const CH_CLS = ["bg-ink", "bg-boost-olive", "bg-boost-light", "bg-paper-border", "bg-ink-muted", "bg-boost-cream"];

export function ChannelsSection({ mix, programSharePct }: { mix: ChannelMix; programSharePct: number | null }) {
  return (
    <section className="space-y-3" aria-labelledby="ca-canaux">
      <div>
        <SectionTitle id="ca-canaux">D&apos;où vient ton chiffre</SectionTitle>
        <p className="text-[13px] text-ink-muted">
          {mix.unit === "articles" ? "Articles vendus par canal de ta caisse" : "Montants notés par moyen de paiement et par plateforme"}, {rangeLabel(mix.range)}
        </p>
      </div>
      <Card className="space-y-3">
        <div className="flex h-3.5 rounded-full overflow-hidden" aria-hidden="true">
          {mix.channels.map((c, i) => (
            <span key={c.label} className={CH_CLS[i % CH_CLS.length]} style={{ width: `${(c.value / mix.total) * 100}%` }} />
          ))}
        </div>
        {mix.channels.map((c, i) => (
          <div key={c.label} className="flex justify-between items-center gap-2 text-[15px] text-ink">
            <span className="inline-flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-[2px] ${CH_CLS[i % CH_CLS.length]}`} aria-hidden="true" />
              {c.label}
            </span>
            <span className="tabular-nums text-right whitespace-nowrap">
              <strong>{mix.unit === "articles" ? `${c.value.toLocaleString("fr-BE")} articles` : eur(c.value)}</strong>
              <span className="text-[13px] text-ink-muted inline-block w-11"> {c.pct} %</span>
            </span>
          </div>
        ))}
        {programSharePct !== null && (
          <p className="text-[13px] text-ink border-t border-paper-border pt-2.5">
            Part venue des clients du programme : <strong>{programSharePct} %</strong> du chiffre des jours lus.
          </p>
        )}
      </Card>
    </section>
  );
}

// ── Chaque jour ─────────────────────────────────────────────────────────────

export function DayList({ days, window, editBase, today }: { days: CaDay[]; window: { from: string; to: string }; editBase: string | null; today: string }) {
  const byDay = new Map(days.map((d) => [d.day, d]));
  const list: string[] = [];
  for (let d = window.to; d >= window.from; ) {
    list.push(d);
    const t = new Date(`${d}T12:00:00Z`);
    t.setUTCDate(t.getUTCDate() - 1);
    d = t.toISOString().slice(0, 10);
  }
  if (list.length === 0) return null;
  return (
    <section className="space-y-3" aria-labelledby="ca-jours">
      <SectionTitle id="ca-jours">Chaque jour</SectionTitle>
      <Card padding="px-4 py-1">
        <ul className="divide-y divide-paper-border">
          {list.map((day) => {
            const d = byDay.get(day);
            const prevDay = new Date(`${day}T12:00:00Z`);
            prevDay.setUTCDate(prevDay.getUTCDate() - 7);
            const pk = prevDay.toISOString().slice(0, 10);
            const p = byDay.get(pk);
            const has = d && !d.closed && typeof d.amount === "number";
            const hasPrev = p && !p.closed && typeof p.amount === "number" && (p.amount as number) > 0;
            const vs = has && hasPrev ? Math.round((((d!.amount as number) - (p!.amount as number)) / (p!.amount as number)) * 100) : null;
            return (
              <li key={day} className="py-2.5 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-[15px] text-ink">
                <span>{listDay(day)}</span>
                <strong className="text-right tabular-nums">{has ? eur(d!.amount as number) : d?.closed ? "fermé" : "pas noté"}</strong>
                <span className="text-[13px] text-ink-muted">
                  {has && typeof d!.tickets === "number" && d!.tickets > 0 ? `${d!.tickets} commandes` : ""}
                  {editBase && isEditableDay(day, today) && (
                    <>
                      {has && typeof d!.tickets === "number" && d!.tickets > 0 ? " · " : ""}
                      <Link href={`${editBase}/${day}`} className="font-semibold text-boost-olive-dark hover:underline">
                        {has || d?.closed ? "Corriger" : "Saisir"}
                      </Link>
                    </>
                  )}
                </span>
                <span className={`text-[13px] text-right ${vs !== null && vs > 0 ? "text-good" : "text-ink-muted"}`}>
                  {vs !== null ? `${signed(vs)} vs ${shortDay(pk)}` : ""}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="text-[13px] text-ink-muted py-2.5">
          « vs » = le même jour de la semaine d&apos;avant.
          {editBase ? "" : " Chiffres lus dans ta caisse : rien à corriger ici."}
        </p>
      </Card>
    </section>
  );
}
