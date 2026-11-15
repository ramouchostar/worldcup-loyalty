import { test } from "node:test";
import assert from "node:assert/strict";
import { daysFromEntries, daysFromPos, platformOfChannel, silentPlatformIdeas, type ChannelInput, type DayRead } from "./chloe-plateformes";
import { checkBar } from "./playbook";
import { ideaKey } from "./proposals";

// La vraie caisse de Kraainem (Belpeople, articles Uber Eats / total), du 19 juillet au 16 août 2026.
const KRAAINEM =
  "19/07 42/407, 20/07 51/612, 21/07 54/788, 22/07 23/477, 23/07 41/483, 25/07 26/471, 26/07 59/388, 27/07 60/331, 28/07 48/491, 29/07 33/421, 30/07 22/478, 31/07 43/615, 01/08 12/417, 02/08 21/397, 03/08 30/435, 04/08 0/357, 05/08 0/390, 06/08 0/516, 07/08 0/424, 08/08 0/375, 09/08 0/302, 11/08 0/389, 12/08 0/568, 14/08 0/519, 15/08 0/552, 16/08 0/592";

function kraainem(until: string, extraWeeksBefore = true): DayRead[] {
  const days: DayRead[] = KRAAINEM.split(", ").map((s) => {
    const [dm, v] = s.split(" ");
    const [u, t] = v.split("/").map(Number);
    const [d, m] = dm.split("/");
    return { day: `2026-${m}-${d}`, total: t, platforms: { uber: u }, eurPerUnit: 6 };
  });
  // Deux semaines de plus avant le 19/07, au rythme habituel, pour avoir 4 mêmes jours de semaine lus.
  const before: DayRead[] = [];
  if (extraWeeksBefore) {
    for (let i = 1; i <= 14; i++) {
      const day = new Date(Date.parse("2026-07-19T00:00:00Z") - i * 86_400_000).toISOString().slice(0, 10);
      before.push({ day, total: 450, platforms: { uber: 40 }, eurPerUnit: 6 });
    }
  }
  return [...before, ...days].filter((d) => d.day <= until);
}

const input = (days: DayRead[], todayISO: string, over: Partial<ChannelInput> = {}): ChannelInput => ({
  restaurantId: "kraainem",
  todayISO,
  unit: "articles",
  source: "belpeople",
  days,
  ...over,
});

test("Kraainem, août 2026 : Uber Eats muet depuis le 4 août, la caisse tournait", () => {
  // Belpeople a ~6 jours de retard : le 22/08, le dernier jour lu est le 16/08.
  const ideas = silentPlatformIdeas(input(kraainem("2026-08-16"), "2026-08-22"));
  assert.equal(ideas.length, 1);
  const idea = ideas[0];
  assert.equal(idea.evidence.platform, "uber");
  assert.equal(idea.evidence.firstSilentDay, "2026-08-04");
  assert.equal(idea.evidence.silentDays, 11, "11 jours lus du 4 au 16 août (le 10 et le 13 manquent chez Belpeople)");
  assert.match(idea.title, /Uber Eats ne vend presque plus rien depuis le mardi 4 août \(11 jours lus\)/);
  assert.match(idea.lines.who, /6 jours de retard/);
  assert.equal(idea.finding, "plateforme:uber:2026-08-04");
  assert.equal(ideaKey(idea), "chloe:plateforme_muette:plateforme:uber:2026-08-04");
  assert.ok(idea.estimate && idea.estimate.high > 0);
  assert.equal(checkBar(idea).ok, true, "lue sur la caisse, fiche active : passe la barre");
});

test("le premier jour muet suffit, dès qu'il est lu", () => {
  const ideas = silentPlatformIdeas(input(kraainem("2026-08-04"), "2026-08-10"));
  assert.equal(ideas.length, 1);
  assert.equal(ideas[0].evidence.silentDays, 1);
});

test("rien quand la plateforme vend comme d'habitude, ni quand elle a repris", () => {
  assert.equal(silentPlatformIdeas(input(kraainem("2026-08-03"), "2026-08-05")).length, 0);
  const recovered = [...kraainem("2026-08-16"), { day: "2026-08-18", total: 430, platforms: { uber: 44 }, eurPerUnit: 6 }];
  assert.equal(silentPlatformIdeas(input(recovered, "2026-08-24")).length, 0);
});

test("rien quand toute la caisse est calme (resto fermé ou jour creux partout)", () => {
  const days = kraainem("2026-08-03");
  days.push({ day: "2026-08-04", total: 60, platforms: { uber: 0 }, eurPerUnit: 6 });
  assert.equal(silentPlatformIdeas(input(days, "2026-08-06")).length, 0);
});

test("rien sans historique (moins de 4 mêmes jours lus) ni sur des données trop vieilles", () => {
  assert.equal(silentPlatformIdeas(input(kraainem("2026-08-16", false).filter((d) => d.day >= "2026-07-26"), "2026-08-20")).length, 0);
  assert.equal(silentPlatformIdeas(input(kraainem("2026-08-16"), "2026-09-01")).length, 0, "16 jours de retard");
});

test("Houba en saisie console : Uber Eats non rempli n'est pas zéro", () => {
  const rows = [
    { sales_day: "2026-11-12", amount: 976.8, uber: 66.6, deliveroo: null, takeaway: 0 },
    { sales_day: "2026-11-13", amount: 1858, uber: null, deliveroo: 34.6, takeaway: null },
  ];
  const days = daysFromEntries(rows);
  assert.deepEqual(days[0].platforms, { uber: 66.6, takeaway: 0 });
  assert.deepEqual(days[1].platforms, { deliveroo: 34.6 });
});

test("caisse Belpeople : canaux reconnus, une plateforme vue un jour vaut zéro les jours où elle manque", () => {
  assert.equal(platformOfChannel("UberEats"), "uber");
  assert.equal(platformOfChannel("Self-order kiosk"), null);
  const days = daysFromPos(
    [
      { sales_day: "2026-08-03", channel_name: "UberEats", items_sold: 30 },
      { sales_day: "2026-08-03", channel_name: "Self-order kiosk", items_sold: 400 },
      { sales_day: "2026-08-04", channel_name: "Self-order kiosk", items_sold: 357 },
    ],
    new Map([["2026-08-04", 2100]])
  );
  const d4 = days.find((d) => d.day === "2026-08-04")!;
  assert.equal(d4.platforms.uber, 0);
  assert.equal(d4.total, 357);
  assert.ok(Math.abs((d4.eurPerUnit ?? 0) - 2100 / 357) < 1e-9);
});
