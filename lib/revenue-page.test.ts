import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays } from "./console-journey";
import { statsPeriod } from "./stats-page";
import {
  caBars,
  caSummary,
  channelMix,
  chloeTips,
  hourGrid,
  lastReadDay,
  monthActual,
  projectMonth,
  projectionSentence,
  rangeLabel,
  readWindow,
  recentOrders,
  roundMoney,
  sameDaysPreviousMonth,
  statsTakeaways,
  weekType,
  type CaDay,
  type HourRow,
} from "./revenue-page";

// Les phrases utilisent des espaces insécables ; on les compare en espaces simples.
const plain = (s: string) => s.replace(/[\u00a0\u202f]/g, " ");

// Une caisse régulière : lundi 3 000 €, mardi 3 200 €… samedi 5 000 €, dimanche 4 500 €.
const BY_WD: Record<number, number> = { 1: 3000, 2: 3200, 3: 3800, 4: 3600, 5: 4600, 6: 5000, 0: 4500 };
const wdOf = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
function caisse(from: string, to: string, tickets = 180): CaDay[] {
  const out: CaDay[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push({ day: d, amount: BY_WD[wdOf(d)], closed: false, tickets });
  return out;
}

const TODAY = "2026-11-15"; // dimanche ; la caisse est lue jusqu'au dimanche 8
const DAYS = caisse("2026-08-01", "2026-11-08");

test("le dernier jour lu ignore aujourd'hui et les jours absents", () => {
  assert.equal(lastReadDay(DAYS, TODAY), "2026-11-08");
  assert.equal(lastReadDay([...DAYS, { day: TODAY, amount: 10, closed: false, tickets: 1 }], TODAY), "2026-11-08");
  assert.equal(lastReadDay([], TODAY), null);
});

test("la comparaison se fait sur les mêmes jours lus du mois d'avant", () => {
  const period = statsPeriod("mois", TODAY, null);
  const win = readWindow(period, "2026-11-08");
  assert.deepEqual(win, { from: "2026-11-01", to: "2026-11-08" });
  assert.deepEqual(sameDaysPreviousMonth(win!), { from: "2026-10-01", to: "2026-10-08" });
  const s = caSummary(DAYS, win!, {}, true);
  assert.equal(s.notedDays, 8);
  assert.equal(s.total, [1, 2, 3, 4, 5, 6, 7, 8].reduce((t, n) => t + BY_WD[wdOf(`2026-11-0${n}`)], 0));
  assert.ok(s.compare);
  assert.deepEqual(s.compare!.window, { from: "2026-10-01", to: "2026-10-08" });
  assert.equal(s.orders, 8 * 180);
  assert.equal(s.best?.day, "2026-11-07"); // samedi
  assert.equal(s.calmest?.day, "2026-11-02"); // lundi
});

test("le 31 du mois se compare à la fin du mois d'avant", () => {
  assert.deepEqual(sameDaysPreviousMonth({ from: "2026-12-01", to: "2026-12-31" }), { from: "2026-11-01", to: "2026-11-30" });
});

test("pas de commandes ni de panier si un jour lu n'a pas ses tickets", () => {
  const days = DAYS.map((d) => (d.day === "2026-11-03" ? { ...d, tickets: null } : d));
  const s = caSummary(days, { from: "2026-11-01", to: "2026-11-08" }, {}, true);
  assert.equal(s.orders, null);
  assert.equal(s.basket, null);
});

test("un jour après le dernier lu est « pas encore lu », jamais zéro", () => {
  const period = statsPeriod("mois", TODAY, null);
  const bars = caBars(DAYS, period, TODAY, "2026-11-08");
  assert.equal(bars.length, 14);
  assert.equal(bars[8].status, "pending");
  assert.equal(bars[8].amount, null);
  assert.equal(bars.filter((b) => b.best).map((b) => b.day).join(), "2026-11-07");
  const holes = caBars(DAYS.filter((d) => d.day !== "2026-11-03"), period, TODAY, "2026-11-08");
  assert.equal(holes[2].status, "missing");
});

test("la semaine type trouve le jour le plus faible et le meilleur", () => {
  const w = weekType(DAYS, "2026-11-08")!;
  assert.equal(w.range.from, "2026-09-14");
  assert.equal(w.weakest?.weekday, 1);
  assert.equal(w.best?.weekday, 6);
  assert.equal(w.days.find((d) => d.weekday === 1)?.avg, 3000);
});

test("un jour habituellement fermé ne devient pas le jour le plus faible", () => {
  const days = DAYS.map((d) => (wdOf(d.day) === 1 ? { ...d, amount: null, closed: true } : d));
  const w = weekType(days, "2026-11-08")!;
  assert.equal(w.weakest?.weekday, 2);
});

test("projection du mois = jours lus + semaine type des jours restants", () => {
  const w = weekType(DAYS, "2026-11-08")!;
  const p = projectMonth(DAYS, "2026-11-01", "2026-11-08", w)!;
  let expected = 0;
  for (let d = "2026-11-01"; d <= "2026-11-30"; d = addDays(d, 1)) expected += BY_WD[wdOf(d)];
  assert.equal(p.readDays, 8);
  assert.equal(p.remainingDays, 22);
  assert.equal(p.expected, roundMoney(expected));
  assert.ok(p.low < p.expected && p.high > p.expected);
  // Une caisse parfaitement régulière garde la marge minimale de 8 % sur la part estimée.
  assert.equal(p.high, roundMoney(p.readTotal + (expected - p.readTotal) * 1.08));
});

test("pas de projection sans 4 semaines lues", () => {
  const short = caisse("2026-10-20", "2026-11-08");
  const w = weekType(short, "2026-11-08")!;
  assert.equal(projectMonth(short, "2026-11-01", "2026-11-08", w), null);
});

test("projection : les jours fériés estimés sont signalés", () => {
  const w = weekType(DAYS, "2026-11-08")!;
  const p = projectMonth(DAYS, "2026-12-01", "2026-11-08", w, new Set(["2026-12-25"]))!;
  assert.deepEqual(p.holidays, ["2026-12-25"]);
  assert.equal(p.readDays, 0);
});

test("le total d'un mois n'est cité que s'il est lu à 90 %", () => {
  assert.equal(monthActual(DAYS, "2026-10-01"), DAYS.filter((d) => d.day.startsWith("2026-10")).reduce((s, d) => s + (d.amount ?? 0), 0));
  assert.equal(monthActual(DAYS, "2026-11-01"), null);
});

test("la phrase de projection compare au mois d'avant et dit la tendance", () => {
  const w = weekType(DAYS, "2026-11-08")!;
  const p = projectMonth(DAYS, "2026-11-01", "2026-11-08", w)!;
  const s = projectionSentence(p, { name: "octobre", total: p.expected }, { window: { from: "2026-10-01", to: "2026-10-08" }, avgPerDay: 1, changePct: 6 }, 8);
  assert.match(plain(s), /^Novembre devrait finir vers .* €, comme octobre\./);
  assert.match(plain(s), /Tes 8 premiers jours sont à \+6 % : si ça tient, tu vises/);
  const down = projectionSentence(p, null, { window: { from: "2026-10-01", to: "2026-10-08" }, avgPerDay: 1, changePct: -7 }, 8);
  assert.match(plain(down), /à −7 % par rapport aux mêmes jours d'octobre/);
});

test("libellés de dates", () => {
  assert.equal(rangeLabel({ from: "2026-11-01", to: "2026-11-08" }), "du 1er au 8 novembre");
  assert.equal(rangeLabel({ from: "2026-10-28", to: "2026-11-03" }), "du 28 octobre au 3 novembre");
  assert.equal(rangeLabel({ from: "2026-11-03", to: "2026-11-03" }), "le 3 novembre");
});

// ── Heures ───────────────────────────────────────────────────────────────────

function hours(): HourRow[] {
  const rows: HourRow[] = [];
  for (let d = "2026-09-14"; d <= "2026-11-08"; d = addDays(d, 1)) {
    const w = wdOf(d);
    // Heure d'hiver à partir du 25 octobre : on écrit en UTC+1 pour garder l'heure de Bruxelles.
    const off = d >= "2026-10-25" ? "+01:00" : "+02:00";
    for (let h = 11; h <= 22; h++) {
      let v = 150;
      if (h === 12) v = w === 6 ? 150 : 600; // samedi midi creux
      if (w === 5 && h >= 18 && h <= 20) v = 700; // vendredi soir
      rows.push({ hour_start: `${d}T${String(h).padStart(2, "0")}:00:00${off}`, gross_inc_vat: v });
    }
  }
  return rows;
}

test("la grille trouve le rush et le creux du midi", () => {
  const g = hourGrid(hours(), "2026-11-08")!;
  assert.ok(g);
  assert.equal(g.hours[0], 11);
  assert.deepEqual(g.rush, { weekday: 5, from: 18, to: 21, total: 2100 });
  assert.equal(g.dip?.weekday, 6);
  assert.equal(g.dip?.hour, 12);
  assert.equal(g.dip?.ratio, 4);
  const fri19 = g.cells[g.hours.indexOf(19)][4];
  assert.equal(fri19.weekday, 5);
  assert.equal(fri19.level, 4);
});

test("pas de grille sans assez de dates", () => {
  assert.equal(hourGrid(hours().slice(0, 12 * 5), "2026-11-08"), null);
  assert.equal(hourGrid(hours(), null), null);
});

// ── Canaux et remarques ──────────────────────────────────────────────────────

test("canaux : noms lisibles et part des plateformes", () => {
  const mix = channelMix(
    [
      { name: "Self-order kiosk", value: 10793 },
      { name: "Intake module", value: 1778 },
      { name: "UberEats", value: 1704 },
      { name: "Website", value: 9 },
    ],
    "articles",
    { from: "2026-10-12", to: "2026-11-08" },
  )!;
  assert.deepEqual(mix.channels.map((c) => c.label), ["Bornes de commande", "Caisse au comptoir", "Uber Eats", "Ton site"]);
  assert.equal(mix.platformPct, 12);
  assert.deepEqual(mix.platformNames, ["Uber Eats"]);
  assert.equal(channelMix([{ name: "Carte", value: 100 }], "euros", { from: "2026-11-01", to: "2026-11-08" }), null);
});

test("Chloé : chaque remarque n'existe que si ses données existent", () => {
  assert.deepEqual(chloeTips({ base: "/admin/x", week: null, grid: null, orders: null, channels: null, forecast: null }), []);
  const week = weekType(DAYS, "2026-11-08");
  const grid = hourGrid(hours(), "2026-11-08");
  const orders = recentOrders(DAYS, "2026-11-08");
  const mix = channelMix([{ name: "Intake", value: 70 }, { name: "UberEats", value: 30 }], "euros", { from: "2026-10-12", to: "2026-11-08" });
  const tips = chloeTips({
    base: "/admin/x",
    week,
    grid,
    orders,
    channels: mix,
    forecast: [
      { date: "2026-11-20", expected: 4700, closed: false, factors: [] },
      { date: "2026-11-21", expected: 5250, closed: false, factors: [{ label: "Paye", effect: 0.08 }] },
    ],
  });
  assert.deepEqual(tips.map((t) => t.id), ["jour_creux", "heures", "panier", "plateformes", "semaine_prochaine"]);
  const creux = tips[0];
  assert.match(plain(creux.title), /^Ton lundi rapporte 2 000 € de moins que ton samedi\.$/);
  assert.match(plain(creux.body), /environ 1 300 € de chiffre en plus par mois/); // 3 000 × 10 % × 52/12
  assert.equal(creux.helper?.id, "hugo");
  assert.match(plain(tips[1].title), /vendredi de 18 h à 21 h : 2 100 €/);
  assert.match(plain(tips[1].body), /samedi midi est presque vide/);
  assert.match(plain(tips[2].title), /^1 € de plus par commande = 5 400 € de plus par mois\.$/); // 180 × 30
  assert.match(plain(tips[3].title), /^30 % de ton chiffre passe par Uber Eats\.$/);
  assert.equal(tips[3].helper?.id, "lea");
  assert.match(plain(tips[4].title), /^Samedi 21 nov\., attends-toi à environ 5 300 €\.$/);
  assert.match(plain(tips[4].body), /paye \(\+8 %\)/);
});

test("pas de remarque plateformes sous 10 %", () => {
  const mix = channelMix([{ name: "Intake", value: 95 }, { name: "UberEats", value: 5 }], "euros", { from: "2026-10-12", to: "2026-11-08" });
  const tips = chloeTips({ base: "/admin/x", week: null, grid: null, orders: null, channels: mix, forecast: null });
  assert.equal(tips.length, 0);
});

test("Stats : deux phrases à retenir au plus", () => {
  const week = weekType(DAYS, "2026-11-08")!;
  const month = projectMonth(DAYS, "2026-11-01", "2026-11-08", week);
  const lines = statsTakeaways({ month, lastMonth: null, summary: null, week });
  assert.equal(lines.length, 2);
  assert.match(plain(lines[1]), /^Le lundi est ton jour le plus faible\. 10 % de clients en plus le lundi = \+1 300 € par mois\.$/);
});
