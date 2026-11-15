import { createAdminClient } from "../supabase";
import { fetchAllRowsStrict } from "../paged-select";
import { addDaysISO, WEEKDAY_LABELS } from "../insights";
import type { IdeaEstimate, IdeaLines } from "./chloe";

// Chloé — la plateforme de livraison qui se tait (ADR 0105 §5, étape 3).
//
// Une tablette Uber Eats éteinte, un restaurant mis en pause chez Deliveroo, un menu retiré : la caisse
// tourne, mais une plateforme ne vend plus rien. Le gérant ne le voit pas (la plateforme ne prévient pas),
// et chaque jour perdu est du chiffre perdu. Cas réel : Kraainem, 0 commande Uber Eats du 4 au 16 août
// 2026 alors que la caisse vendait 300 à 590 articles par jour (20 à 60 par Uber Eats les autres jours).
//
// Règle (pure, testée) : pour le DERNIER jour lu, une plateforme est « muette » quand
//   - elle a un historique : au moins 4 mêmes jours de semaine lus, médiane ≥ seuil ;
//   - elle vend moins de 30 % de cette médiane ;
//   - ET la caisse, elle, tourne : total au moins 60 % de sa médiane du même jour (sinon le resto était
//     fermé ou la journée était creuse partout, ce n'est pas la plateforme).
// Un jour absent n'est jamais zéro (Belpeople a environ 6 jours de retard) : on juge le dernier jour LU,
// et le texte dit sa date. Une plateforme qui a repris ne déclenche rien : une panne finie ne se répare plus.
//
// Sources, toutes deux « caisse » (condition 2 de la barre) :
//   - la caisse lue par Belpeople (`pos_product_sales`, articles par canal et par jour) quand elle existe ;
//   - sinon les montants par plateforme du CA du jour (`daily_revenue_entries`, saisie console).

export type Platform = "uber" | "deliveroo" | "takeaway";
export const PLATFORM_LABELS: Record<Platform, string> = { uber: "Uber Eats", deliveroo: "Deliveroo", takeaway: "Takeaway" };

/** Un jour lu : total de la caisse et ventes par plateforme, dans la même unité. `undefined` = pas lu. */
export type DayRead = { day: string; total: number; platforms: Partial<Record<Platform, number>>; eurPerUnit: number | null };

export type ChannelInput = {
  restaurantId: string;
  todayISO: string;
  unit: "articles" | "euros";
  source: "belpeople" | "saisie";
  days: DayRead[]; // ordre quelconque
};

export type PlatformIdea = {
  assistant: "chloe";
  type: "plateforme_muette";
  finding: string; // « plateforme:<id>:<premier jour muet> » : une idée par panne
  title: string;
  question: string;
  lines: IdeaLines;
  estimate: IdeaEstimate | null;
  decideBy: string;
  action: { kind: "team"; note: string; label: string };
  evidence: Record<string, number | string | string[]>;
};

// ─── Réglages ─────────────────────────────────────────────────────────────────

/** Mêmes jours de semaine lus avant de juger. */
export const MIN_HISTORY = 4;
/** On regarde au plus 8 semaines en arrière. */
export const HISTORY_WEEKS = 8;
/** Une plateforme « parle » à partir de ce volume médian (en dessous, un jour à 0 est du hasard). */
export const MIN_MEDIAN: Record<ChannelInput["unit"], number> = { articles: 10, euros: 100 };
/** Muette sous 30 % de sa médiane… */
export const SILENT_RATIO = 0.3;
/** … pendant que la caisse fait au moins 60 % de la sienne. */
export const OPEN_RATIO = 0.6;
/** Au-delà, le dernier jour lu est trop vieux pour qu'une alerte serve encore. */
export const MAX_DATA_AGE_DAYS = 10;
/** L'idée se décide vite : chaque jour compte. */
export const DECIDE_DAYS = 2;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const weekday = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const fmtDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-BE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

type Judgement = { silent: boolean; value: number; median: number; totalMedian: number } | null;

/** Le jour `d` est-il muet pour `p` ? `null` : pas assez d'historique pour le dire. */
function judge(days: DayRead[], d: DayRead, p: Platform, unit: ChannelInput["unit"]): Judgement {
  const value = d.platforms[p];
  if (value === undefined) return null;
  const past = days
    .filter((x) => x.day < d.day && weekday(x.day) === weekday(d.day) && dayDiff(x.day, d.day) <= HISTORY_WEEKS * 7)
    .sort((a, b) => (a.day < b.day ? 1 : -1));
  const hist = past.map((x) => x.platforms[p]).filter((v): v is number => v !== undefined);
  if (hist.length < MIN_HISTORY) return null;
  const med = median(hist);
  if (med < MIN_MEDIAN[unit]) return null;
  const totalMed = median(past.map((x) => x.total));
  const silent = value < SILENT_RATIO * med && d.total >= OPEN_RATIO * totalMed;
  return { silent, value, median: med, totalMedian: totalMed };
}

/** Les idées « plateforme muette » : une par plateforme muette au dernier jour lu. */
export function silentPlatformIdeas(input: ChannelInput): PlatformIdea[] {
  const days = [...input.days].sort((a, b) => (a.day < b.day ? -1 : 1));
  const last = days[days.length - 1];
  if (!last || dayDiff(last.day, input.todayISO) > MAX_DATA_AGE_DAYS) return [];

  const ideas: PlatformIdea[] = [];
  for (const p of Object.keys(PLATFORM_LABELS) as Platform[]) {
    const j = judge(days, last, p, input.unit);
    if (!j?.silent) continue;

    // Depuis quand : on remonte les jours lus tant qu'ils restent muets, jugés contre la MÊME
    // référence que le dernier jour (les jours de la panne n'ont pas tous 4 semaines d'historique).
    let start = last.day;
    let silentDays = 1;
    for (let i = days.length - 2; i >= 0; i--) {
      const v = days[i].platforms[p];
      if (v === undefined || v >= SILENT_RATIO * j.median || days[i].total < OPEN_RATIO * j.totalMedian) break;
      start = days[i].day;
      silentDays++;
    }

    const name = PLATFORM_LABELS[p];
    const unitWord = input.unit === "articles" ? "articles" : "€";
    const usual = Math.round(j.median);
    const got = Math.round(j.value);
    const perDayEur = input.unit === "euros" ? j.median : last.eurPerUnit ? j.median * last.eurPerUnit : null;
    const since = silentDays > 1 ? `depuis le ${fmtDay(start)} (${silentDays} jours lus)` : `le ${fmtDay(last.day)}`;
    const lag = dayDiff(last.day, input.todayISO);

    ideas.push({
      assistant: "chloe",
      type: "plateforme_muette",
      finding: `plateforme:${p}:${start}`,
      title: `${name} ne vend presque plus rien ${since}`,
      question: "Tu vérifies ta tablette ?",
      lines: {
        what: `${name} a fait ${got} ${unitWord} le ${WEEKDAY_LABELS[weekday(last.day)]} ${fmtDay(last.day).split(" ").slice(1).join(" ")}, contre ${usual} ${unitWord} d'habitude ce jour-là, alors que ta caisse tournait normalement. Tablette éteinte, restaurant en pause ou menu retiré chez ${name} ?`,
        who: `Toi, tout de suite : regarde la tablette et ton espace ${name}.${lag > 1 ? ` Mes chiffres ont ${lag} jours de retard : c'est peut-être déjà reparti.` : ""} Sur « Oui », l'équipe Boosteats t'appelle si ça ne repart pas.`,
        cost: "0 € : quelques minutes de vérification.",
      },
      estimate:
        perDayEur !== null && perDayEur > 0
          ? {
              low: Math.round(perDayEur * 0.7),
              high: Math.round(perDayEur),
              unit: `€ de ventes ${name} par jour`,
              basis: `Ce que ${name} fait d'habitude un ${WEEKDAY_LABELS[weekday(last.day)]} (médiane des ${MIN_HISTORY}+ derniers)${input.unit === "articles" ? ", converti au prix moyen d'un article ce jour-là" : ""}.`,
            }
          : null,
      decideBy: addDaysISO(input.todayISO, DECIDE_DAYS),
      action: {
        kind: "team",
        note: `Vérifier avec le gérant que ${name} est en ligne (tablette allumée, restaurant ouvert, menu publié) ; muette ${since}.`,
        label: "Oui, je vérifie",
      },
      evidence: {
        source: "caisse",
        dataSource: input.source,
        platform: p,
        unit: input.unit,
        lastDay: last.day,
        firstSilentDay: start,
        silentDays,
        value: got,
        median: usual,
        total: Math.round(last.total),
        totalMedian: Math.round(j.totalMedian),
        dataLagDays: lag,
      },
    });
  }
  return ideas;
}

// ─── Lecture en base ──────────────────────────────────────────────────────────

/** Le nom de canal de la caisse (Belpeople) vers une plateforme, ou `null` (borne, comptoir, site…). */
export function platformOfChannel(name: string | null): Platform | null {
  const n = (name ?? "").toLowerCase();
  if (/uber/.test(n)) return "uber";
  if (/deliveroo/.test(n)) return "deliveroo";
  if (/takeaway|just ?eat/.test(n)) return "takeaway";
  return null;
}

type PosRow = { sales_day: string; channel_name: string | null; items_sold: number | null };
type EntryRow = { sales_day: string; amount: number | null; uber: number | null; deliveroo: number | null; takeaway: number | null };

/** Jours de la caisse Belpeople, articles par plateforme. Une plateforme jamais vue n'est pas lue (`undefined`), pas zéro. */
export function daysFromPos(rows: PosRow[], amounts: Map<string, number>): DayRead[] {
  const byDay = new Map<string, DayRead>();
  const seen = new Set<Platform>();
  for (const r of rows) {
    const p = platformOfChannel(r.channel_name);
    if (p) seen.add(p);
  }
  for (const r of rows) {
    const d = byDay.get(r.sales_day) ?? { day: r.sales_day, total: 0, platforms: Object.fromEntries([...seen].map((p) => [p, 0])), eurPerUnit: null };
    const n = Number(r.items_sold) || 0;
    d.total += n;
    const p = platformOfChannel(r.channel_name);
    if (p) d.platforms[p] = (d.platforms[p] ?? 0) + n;
    byDay.set(r.sales_day, d);
  }
  for (const d of byDay.values()) {
    const eur = amounts.get(d.day);
    d.eurPerUnit = eur && d.total > 0 ? eur / d.total : null;
  }
  return [...byDay.values()];
}

/** Jours du CA saisi en console : une plateforme non remplie (`null`) n'est pas lue, pas zéro. */
export function daysFromEntries(rows: EntryRow[]): DayRead[] {
  return rows
    .filter((r) => Number(r.amount) > 0)
    .map((r) => {
      const platforms: Partial<Record<Platform, number>> = {};
      for (const p of ["uber", "deliveroo", "takeaway"] as const) if (r[p] !== null && r[p] !== undefined) platforms[p] = Number(r[p]);
      return { day: r.sales_day, total: Number(r.amount), platforms, eurPerUnit: 1 };
    });
}

/**
 * La caisse Belpeople si elle a des lignes ces 14 derniers jours ; sinon la saisie du CA du jour.
 * Lectures paginées et strictes : un historique tronqué fabriquerait une fausse médiane.
 */
export async function loadChannelInput(restaurantId: string, todayISO: string): Promise<ChannelInput> {
  const admin = createAdminClient();
  const since = addDaysISO(todayISO, -(HISTORY_WEEKS * 7 + MAX_DATA_AGE_DAYS + 7));
  const entries = await fetchAllRowsStrict<EntryRow>("Chloé : CA du jour", (from, to) =>
    admin
      .from("daily_revenue_entries")
      .select("sales_day, amount, uber, deliveroo, takeaway")
      .eq("restaurant_id", restaurantId)
      .gte("sales_day", since)
      .order("sales_day")
      .range(from, to)
  );
  const pos = await fetchAllRowsStrict<PosRow>("Chloé : caisse par canal", (from, to) =>
    admin
      .from("pos_product_sales")
      .select("sales_day, channel_name, items_sold")
      .eq("restaurant_id", restaurantId)
      .gte("sales_day", since)
      .order("sales_day")
      .order("product_id")
      .order("channel_id")
      .range(from, to)
  );
  const recentPos = pos.some((r) => dayDiff(r.sales_day, todayISO) <= 14);
  if (recentPos) {
    const amounts = new Map(entries.filter((e) => Number(e.amount) > 0).map((e) => [e.sales_day, Number(e.amount)]));
    return { restaurantId, todayISO, unit: "articles", source: "belpeople", days: daysFromPos(pos, amounts) };
  }
  return { restaurantId, todayISO, unit: "euros", source: "saisie", days: daysFromEntries(entries) };
}
