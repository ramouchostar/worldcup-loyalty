import { test } from "node:test";
import assert from "node:assert/strict";
import { computeMemberStats, TREND_WEEKS } from "./member-stats";

// Scénarios recalculables à la main — même exigence que lib/program-value.test.ts.
// Repère commun : today = 2026-09-06, 4 semaines glissantes.
//   pos 0 : 2026-08-10 → 2026-08-16
//   pos 1 : 2026-08-17 → 2026-08-23
//   pos 2 : 2026-08-24 → 2026-08-30   (« semaine précédente »)
//   pos 3 : 2026-08-31 → 2026-09-06   (« semaine en cours », finit aujourd'hui)

const base = {
  today: "2026-09-06",
  weeks: 4,
  memberships: [] as { user_id: string; joined_at: string }[],
  teams: [] as { created_at: string; created_by: string | null }[],
  installs: [] as { user_id: string; installed_at: string }[],
  orders: [] as { user_id: string; order_date: string }[],
};

test("fenêtres glissantes de 7 jours, de la plus ancienne à la plus récente", () => {
  const s = computeMemberStats(base);
  assert.deepEqual(
    s.members.joined.weeks.map((w) => [w.start, w.end]),
    [
      ["2026-08-10", "2026-08-16"],
      ["2026-08-17", "2026-08-23"],
      ["2026-08-24", "2026-08-30"],
      ["2026-08-31", "2026-09-06"],
    ]
  );
  assert.equal(s.window.start, "2026-08-10");
  assert.equal(s.window.end, "2026-09-06");
});

test("membres : un compte de deux établissements compte une fois, à sa première adhésion", () => {
  const s = computeMemberStats({
    ...base,
    memberships: [
      { user_id: "u1", joined_at: "2026-08-25T10:00:00Z" }, // semaine précédente
      { user_id: "u1", joined_at: "2026-09-02T10:00:00Z" }, // 2e resto — pas un nouveau membre
      { user_id: "u2", joined_at: "2026-09-01T08:00:00Z" }, // semaine en cours
      { user_id: "u3", joined_at: "2026-01-04T08:00:00Z" }, // hors fenêtre, compte au cumul
    ],
  });
  assert.equal(s.members.total, 3); // comptes distincts
  assert.equal(s.members.memberships, 4); // lignes d'adhésion (ce que liste le tableau)
  assert.deepEqual(s.members.joined.weeks.map((w) => w.value), [0, 0, 1, 1]);
  assert.equal(s.members.joined.current, 1);
  assert.equal(s.members.joined.previous, 1);
});

test("équipes créées : cumul et répartition par semaine", () => {
  const s = computeMemberStats({
    ...base,
    teams: [
      { created_at: "2026-08-12T09:00:00Z", created_by: "u1" },
      { created_at: "2026-08-31T00:00:00Z", created_by: "u2" }, // 1er jour de la semaine en cours
      { created_at: "2026-09-06T23:59:00Z", created_by: null }, // aujourd'hui, encore dedans
      { created_at: "2025-12-01T09:00:00Z", created_by: "u3" }, // hors fenêtre
    ],
  });
  assert.equal(s.teams.total, 4);
  assert.deepEqual(s.teams.created.weeks.map((w) => w.value), [1, 0, 0, 2]);
  assert.equal(s.teams.created.current, 2);
  assert.equal(s.teams.created.previous, 0);
});

test("app installée : part rapportée aux membres distincts", () => {
  const s = computeMemberStats({
    ...base,
    memberships: [
      { user_id: "u1", joined_at: "2026-06-01T10:00:00Z" },
      { user_id: "u2", joined_at: "2026-06-01T10:00:00Z" },
      { user_id: "u3", joined_at: "2026-06-01T10:00:00Z" },
      { user_id: "u4", joined_at: "2026-06-01T10:00:00Z" },
    ],
    installs: [
      { user_id: "u1", installed_at: "2026-09-03T10:00:00Z" },
      { user_id: "u2", installed_at: "2026-08-26T10:00:00Z" },
      { user_id: "u3", installed_at: "2026-05-01T10:00:00Z" }, // hors fenêtre
    ],
  });
  assert.equal(s.installs.total, 3);
  assert.equal(s.installs.sharePct, 75);
  assert.deepEqual(s.installs.installed.weeks.map((w) => w.value), [0, 0, 1, 1]);
});

test("tickets par membre actif : dénominateur = membres ayant commandé la semaine", () => {
  const s = computeMemberStats({
    ...base,
    orders: [
      // Semaine en cours : 5 tickets, 2 membres actifs → 2,5
      { user_id: "u1", order_date: "2026-08-31" },
      { user_id: "u1", order_date: "2026-09-02" },
      { user_id: "u1", order_date: "2026-09-06" },
      { user_id: "u2", order_date: "2026-09-04" },
      { user_id: "u2", order_date: "2026-09-05" },
      // Semaine précédente : 2 tickets, 2 membres actifs → 1
      { user_id: "u1", order_date: "2026-08-24" },
      { user_id: "u3", order_date: "2026-08-30" },
    ],
  });
  assert.equal(s.ordersPerActiveMember.ratio, 2.5);
  assert.equal(s.ordersPerActiveMember.orders, 5);
  assert.equal(s.ordersPerActiveMember.activeMembers, 2);
  assert.deepEqual(s.ordersPerActiveMember.trend.weeks.map((w) => w.value), [0, 0, 1, 2.5]);
  assert.equal(s.ordersPerActiveMember.trend.previous, 1);
});

test("aucune donnée : ratio et part restent nuls plutôt que zéro", () => {
  const s = computeMemberStats(base);
  assert.equal(s.ordersPerActiveMember.ratio, null);
  assert.equal(s.installs.sharePct, null);
  assert.equal(s.members.total, 0);
  assert.equal(s.truncated, false);
});

test("horodatage futur : jamais compté dans une semaine", () => {
  const s = computeMemberStats({
    ...base,
    memberships: [{ user_id: "u1", joined_at: "2026-09-20T10:00:00Z" }],
  });
  assert.equal(s.members.total, 1); // le cumul le voit
  assert.deepEqual(s.members.joined.weeks.map((w) => w.value), [0, 0, 0, 0]);
});

test("par défaut, douze semaines de courbe", () => {
  const s = computeMemberStats({ ...base, weeks: undefined });
  assert.equal(s.members.joined.weeks.length, TREND_WEEKS);
  assert.equal(s.window.start, "2026-06-15"); // 2026-09-06 − 83 jours
});
