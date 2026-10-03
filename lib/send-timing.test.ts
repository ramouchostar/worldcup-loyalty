import { test } from "node:test";
import assert from "node:assert/strict";
import { clicksByHour, formatDelay, summarizeSlots, timingVerdict, visitsByHour, MIN_SENDS_PER_SLOT, type TimedSend } from "./send-timing";

const at = (iso: string, plusMin = 0) => new Date(new Date(iso).getTime() + plusMin * 60_000).toISOString();

function sends(slot: number, n: number, clicks: number, channel = "email", delayMin = 30): TimedSend[] {
  return Array.from({ length: n }, (_, i) => ({
    slot,
    channel,
    status: "delivered",
    createdAt: at("2026-10-02T07:00:00Z"),
    clickedAt: i < clicks ? at("2026-10-02T07:00:00Z", delayMin) : null,
  }));
}

test("par créneau : envois lus, clics, taux, délai médian ; échecs et témoins écartés", () => {
  const rows = [
    ...sends(900, 4, 1, "email", 20),
    ...sends(1100, 2, 2, "push", 5),
    { slot: 900, channel: "email", status: "failed", createdAt: at("2026-10-02T07:00:00Z"), clickedAt: null },
  ];
  const all = summarizeSlots(rows);
  assert.deepEqual(all.find((s) => s.slot === 900), { slot: 900, sends: 4, clicks: 1, rate: 25, medianDelayMin: 20 });
  assert.deepEqual(all.find((s) => s.slot === 1500), { slot: 1500, sends: 0, clicks: 0, rate: null, medianDelayMin: null });
  assert.equal(summarizeSlots(rows, "email").find((s) => s.slot === 1100)!.sends, 0);
  assert.equal(summarizeSlots(rows, "push").find((s) => s.slot === 1100)!.rate, 100);
});

test("pas de conclusion tant qu'un créneau a moins de 30 envois ou que le meilleur a moins de 10 clics", () => {
  const few = summarizeSlots([...sends(900, 14, 3), ...sends(1100, 13, 6), ...sends(1500, 15, 2), ...sends(1730, 12, 4)]);
  assert.deepEqual(timingVerdict(few), { kind: "wait", totalSends: 54, missingSlots: 4 });

  const N = MIN_SENDS_PER_SLOT;
  const enough = summarizeSlots([...sends(900, N, 5), ...sends(1100, N, 14), ...sends(1500, N, 3), ...sends(1730, N, 8)]);
  assert.deepEqual(timingVerdict(enough), { kind: "best", slot: 1100, rate: 47 });

  const fewClicks = summarizeSlots([...sends(900, N, 2), ...sends(1100, N, 9), ...sends(1500, N, 1), ...sends(1730, N, 3)]);
  assert.equal(timingVerdict(fewClicks).kind, "wait");
});

test("heures de clic et de visite à Bruxelles", () => {
  const byHour = clicksByHour([
    { slot: null, channel: "email", status: "sent", createdAt: "2026-10-02T16:00:00Z", clickedAt: "2026-10-02T16:40:00Z" }, // 18 h 40
    { slot: null, channel: "email", status: "sent", createdAt: "2026-10-02T16:00:00Z", clickedAt: null },
  ]);
  assert.equal(byHour[18], 1);
  assert.equal(byHour.reduce((a, b) => a + b, 0), 1);
  const visits = visitsByHour([{ hour: 10, visits: 3 }, { hour: 10, visits: 2 }, { hour: 25, visits: 9 }]);
  assert.equal(visits[10], 5);
  assert.equal(visits.reduce((a, b) => a + b, 0), 5);
  assert.equal(formatDelay(25), "25 min");
  assert.equal(formatDelay(190), "3 h 10");
  assert.equal(formatDelay(null), "—");
});
