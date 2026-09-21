import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  brusselsDay,
  buildSimpleHomeView,
  countByDay,
  daysToReach,
  goalForDay,
  goalFromHistory,
  nextGoalLevel,
  launchChecklist,
  milestoneView,
  monthView,
  pickMilestone,
  staffTodo,
  STAFF_CODES_TARGET,
  recentDays,
  stageOf,
  stageStates,
  tipOfTheDay,
  COUNTER_TIPS,
  type DayCounts,
  type SimpleHomeRaw,
} from "./console-journey";

// Remplit `counts` avec une série de jours se terminant la veille de `today`.
function history(today: string, values: number[]): DayCounts {
  const out: DayCounts = {};
  values.forEach((v, i) => {
    out[addDays(today, i - values.length)] = v;
  });
  return out;
}

test("étapes : 10 tickets pour quitter le lancement, 100 sur 90 jours pour grandir", () => {
  assert.equal(stageOf({ validatedTotal: 0, validatedWindow: 0 }), "lancer");
  assert.equal(stageOf({ validatedTotal: 9, validatedWindow: 9 }), "lancer");
  assert.equal(stageOf({ validatedTotal: 10, validatedWindow: 10 }), "rythme");
  assert.equal(stageOf({ validatedTotal: 400, validatedWindow: 99 }), "rythme");
  assert.equal(stageOf({ validatedTotal: 120, validatedWindow: 100 }), "croissance");
  assert.deepEqual(stageStates("rythme").map((s) => s.state), ["done", "current", "locked"]);
});

test("objectif : le premier palier pas encore tenu 5 jours sur 7", () => {
  // Établissement qui démarre : on vise 3, jamais un chiffre hors de portée
  assert.equal(goalFromHistory([0, 0, 0, 0, 0, 0, 0]), 3);
  // Kraainem, semaine du 14 au 20 septembre 2026 : 3 tenu 5 fois, 4 seulement 4 fois
  assert.equal(goalFromHistory([3, 0, 5, 4, 6, 1, 5]), 4);
  // 5 tenu 5 jours sur 7 → on vise 6, pas 10 : les paliers restent à portée
  assert.equal(goalFromHistory([5, 6, 5, 2, 7, 5, 1]), 6);
  // Tout au plafond
  assert.equal(goalFromHistory([80, 80, 80, 80, 80, 80, 80]), 60);
  assert.equal(nextGoalLevel(4), 5);
  assert.equal(nextGoalLevel(60), null);
});

test("objectif du jour : calculé sur les 7 jours qui précèdent, pas sur le jour même", () => {
  const today = "2026-09-21";
  const counts = { ...history(today, [3, 0, 5, 4, 6, 1, 5]), [today]: 40 };
  assert.equal(goalForDay(counts, today), 4);
});

test("objectif : une mauvaise semaine le fait redescendre au lieu de rester un reproche", () => {
  const today = "2026-09-21";
  assert.equal(goalForDay(history(today, [8, 8, 8, 8, 8, 8, 8]), today), 10);
  assert.equal(goalForDay(history(today, [8, 8, 8, 8, 8, 8, 8, 2, 1, 3, 2, 8, 2, 1]), today), 3);
});

test("jours récents : du plus ancien à aujourd'hui, avec la lettre du jour", () => {
  const cells = recentDays({ "2026-09-21": 2, "2026-09-20": 5 }, "2026-09-21", 4, 7);
  assert.equal(cells.length, 7);
  assert.equal(cells[0].day, "2026-09-15");
  assert.equal(cells[6].isToday, true);
  assert.equal(cells[6].letter, "L"); // lundi 21 septembre 2026
  assert.equal(cells[6].count, 2);
  assert.equal(cells[6].met, false);
  assert.equal(cells[5].met, true); // jugé contre l'objectif d'aujourd'hui
});

test("jour belge : un ticket de 23 h 30 appartient à la journée de commerce", () => {
  // 21:30 UTC = 23:30 à Bruxelles (heure d'été)
  assert.equal(brusselsDay("2026-09-20T21:30:00Z"), "2026-09-20");
  // 22:30 UTC = 00:30 le lendemain
  assert.equal(brusselsDay("2026-09-20T22:30:00Z"), "2026-09-21");
  assert.deepEqual(countByDay(["2026-09-20T10:00:00Z", "2026-09-20T21:30:00Z", "2026-09-20T22:30:00Z"]), {
    "2026-09-20": 2,
    "2026-09-21": 1,
  });
});

test("délai : environ, jamais une promesse sur un rythme nul", () => {
  assert.equal(daysToReach(0, 3), 0);
  assert.equal(daysToReach(34, 3.9), 9);
  assert.equal(daysToReach(34, 0), null);
});

test("liste de lancement : un siège équipe ne reçoit pas une tâche qu'il ne peut pas faire", () => {
  const base = { base: "/admin/x", catalogItemsWithCost: 0, landings14d: 0, validatedTotal: 0, budgetPct: 0.08 };
  const equipe = launchChecklist({ ...base, hasLogo: false, canManage: false });
  assert.equal(equipe.some((i) => i.key === "logo"), false);
  const gerant = launchChecklist({ ...base, hasLogo: false, canManage: true });
  assert.equal(gerant[0].key, "logo");
  assert.equal(gerant.every((i) => !i.done), true);
  assert.match(gerant.find((i) => i.key === "menu")!.hint, /8 %/);

  const avance = launchChecklist({ ...base, hasLogo: true, canManage: true, catalogItemsWithCost: 40, landings14d: 12, validatedTotal: 7, budgetPct: 0.04 });
  // Quatre gestes : le QR de l'équipe vit dans « À faire », pas ici
  assert.deepEqual(avance.map((i) => i.key), ["logo", "menu", "qr", "tickets"]);
  assert.deepEqual(avance.map((i) => i.done), [true, true, true, false]);
  assert.deepEqual(avance.find((i) => i.key === "tickets")!.progress, { value: 7, target: 10 });
  assert.match(avance.find((i) => i.key === "menu")!.hint, /4 %/);
});

test("QR de l'équipe : on insiste tant qu'il y en a moins de trois, avec un lien vers la création", () => {
  const zero = staffTodo("/admin/x", []);
  assert.equal(zero?.title, "Crée le QR de chaque personne en salle");
  assert.equal(zero?.cta, "Créer les QR de mon équipe");
  assert.equal(zero?.href, "/admin/x/qr?creer=1#equipe");

  const deux = staffTodo("/admin/x", [
    { label: "Sarah", isActive: true },
    { label: "Yanis", isActive: true },
    { label: "Ancien", isActive: false },
  ]);
  assert.equal(deux?.cta, "Ajouter un QR");
  assert.match(deux!.hint, /2 QR créés \(Sarah, Yanis\)/);

  const equipee = Array.from({ length: STAFF_CODES_TARGET }, (_, i) => ({ label: `P${i}`, isActive: true }));
  assert.equal(staffTodo("/admin/x", equipee), null);
  // Migration absente : on ne réclame pas un outil qui n'existe pas encore
  assert.equal(staffTodo("/admin/x", null), null);
});

test("caps : la fête d'abord, sinon le cap le plus avancé", () => {
  const crossed = milestoneView("tickets", 52, 47);
  assert.equal(crossed.crossed, 50);
  assert.equal(pickMilestone([milestoneView("members", 111, 108), crossed])?.kind, "tickets");
  // 66/100 tickets (66 %) contre 111/250 membres (44 %)
  const picked = pickMilestone([milestoneView("members", 111, 108), milestoneView("tickets", 66, 60)]);
  assert.equal(picked?.kind, "tickets");
  assert.equal(picked?.next, 100);
});

test("mois : rien à montrer sans commande, et le coût jamais négatif", () => {
  assert.equal(monthView(0, 0), null);
  assert.deepEqual(monthView(1280, 42), { revenue: 1280, rewardsCost: 42, perEuro: 30 });
  assert.deepEqual(monthView(500, 0), { revenue: 500, rewardsCost: 0, perEuro: null });
});

test("geste du jour : le même toute la journée", () => {
  assert.equal(tipOfTheDay("2026-09-21"), tipOfTheDay("2026-09-21"));
  assert.ok(COUNTER_TIPS.includes(tipOfTheDay("2026-09-22")));
});

function raw(over: Partial<SimpleHomeRaw> = {}): SimpleHomeRaw {
  const today = "2026-09-21";
  return {
    base: "/admin/kraainem",
    today,
    receivedByDay: { ...history(today, [3, 0, 5, 4, 6, 1, 5]), [today]: 3 },
    validatedTotal: 66,
    validatedWindow: 66,
    validatedWeekAgo: 42,
    membersTotal: 111,
    membersWeekAgo: 100,
    hasLogo: true,
    canManage: true,
    catalogItemsWithCost: 118,
    landings14d: 200,
    staff: [
      { label: "Sarah", signups30d: 12, isActive: true },
      { label: "Yanis", signups30d: 4, isActive: true },
      { label: "Ancien", signups30d: 9, isActive: false },
    ],
    todo: { flagged: 1, pending: 2, claims: 0, catalogGaps: 3 },
    month: { revenue: 1280, rewardsCost: 42 },
    budgetPct: 0.04,
    ...over,
  };
}

test("accueil : Kraainem au 21 septembre — étape rythme, objectif 4, palier 5 à un jour près", () => {
  const v = buildSimpleHomeView(raw());
  assert.equal(v.stage, "rythme");
  assert.equal(v.goal.target, 4);
  assert.equal(v.goal.today, 3);
  assert.equal(v.goal.remaining, 1);
  // 6 derniers jours complets (0, 5, 4, 6, 1, 5) + aujourd'hui (3) : 4 jours à 4+
  assert.equal(v.goal.heldDays, 4);
  assert.equal(v.goal.nextLevel, 5);
  assert.equal(v.next.kind, "growth");
  if (v.next.kind === "growth") {
    assert.equal(v.next.value, 66);
    assert.ok(v.next.eta !== null && v.next.eta > 0);
  }
  // Un code désactivé ne figure pas au classement
  assert.deepEqual(v.staffTop.map((s) => s.label), ["Sarah", "Yanis"]);
  // Le cap franchi cette semaine (50 tickets) passe avant le suivant
  assert.equal(v.milestone?.crossed, 50);
  // Deux QR d'équipe actifs sur trois : la tâche passe en tête ; un ticket
  // suspect n'est pas compté deux fois (en attente ET à vérifier)
  assert.deepEqual(v.todo.map((t) => [t.key, t.count]), [["staff", 2], ["flagged", 1], ["pending", 1], ["catalog", 3]]);
});

test("accueil : sans QR d'équipe, la tâche est en tête de « À faire », pas en double dans la prochaine étape", () => {
  const v = buildSimpleHomeView(raw({ staff: [] }));
  assert.equal(v.todo[0].key, "staff");
  assert.equal(v.todo[0].cta, "Créer les QR de mon équipe");
  assert.equal(v.next.kind, "growth");
  // Migration absente (null) : aucune tâche QR
  assert.equal(buildSimpleHomeView(raw({ staff: null })).todo.some((t) => t.key === "staff"), false);
});

test("accueil : un établissement tout neuf commence par la liste de lancement", () => {
  const v = buildSimpleHomeView(
    raw({ receivedByDay: {}, validatedTotal: 0, validatedWindow: 0, validatedWeekAgo: 0, membersTotal: 0, membersWeekAgo: 0, hasLogo: false, catalogItemsWithCost: 0, landings14d: 0, staff: [], todo: { flagged: 0, pending: 0, claims: 0, catalogGaps: 0 }, month: { revenue: 0, rewardsCost: 0 } })
  );
  assert.equal(v.stage, "lancer");
  assert.equal(v.next.kind, "checklist");
  if (v.next.kind === "checklist") assert.equal(v.next.item.key, "logo");
  assert.equal(v.checklist.done, 0);
  assert.equal(v.month, null);
  assert.equal(v.goal.target, 3);
  assert.equal(v.milestone?.next, 10); // 10 membres : le premier cap à portée
});
