import assert from "node:assert/strict";
import { test } from "node:test";
import { ERASED_NAME, PURGE_DAYS_DEFAULT, purgeCutoff, purgeDays, runPurge, type PurgeDb } from "./purge";

type Row = { createdAt: string; firstName: string; phone: string | null };

class MemPurgeDb implements PurgeDb {
  erasedCalls = 0;
  constructor(public rows: Row[], public missing = false) {}
  private hit(r: Row, cutoff: string) { return r.createdAt < cutoff && (r.phone !== null || r.firstName !== ERASED_NAME); }
  async count(cutoff: string) { return this.missing ? null : this.rows.filter((r) => this.hit(r, cutoff)).length; }
  async erase(cutoff: string) {
    if (this.missing) return null;
    this.erasedCalls++;
    let n = 0;
    for (const r of this.rows) if (this.hit(r, cutoff)) { r.firstName = ERASED_NAME; r.phone = null; n++; }
    return n;
  }
}

const NOW = new Date("2026-11-30T03:00:00Z");
const old = (days: number): string => new Date(NOW.getTime() - days * 24 * 3600 * 1000).toISOString();

test("purgeDays : défaut 30, réglage entier gardé, hors bornes ramené, illisible = défaut signalé", () => {
  assert.deepEqual(purgeDays(undefined), { days: PURGE_DAYS_DEFAULT, fromEnv: false, invalid: false });
  assert.deepEqual(purgeDays(""), { days: 30, fromEnv: false, invalid: false });
  assert.deepEqual(purgeDays(" 45 "), { days: 45, fromEnv: true, invalid: false });
  assert.equal(purgeDays("1").days, 7);
  assert.equal(purgeDays("9999").days, 365);
  assert.deepEqual(purgeDays("beaucoup"), { days: 30, fromEnv: false, invalid: true });
  assert.deepEqual(purgeDays("12.5"), { days: 30, fromEnv: false, invalid: true });
});

test("purgeCutoff : exactement N jours avant", () => {
  assert.equal(purgeCutoff(NOW, 30), "2026-10-31T03:00:00.000Z");
});

test("runPurge : efface prénom et téléphone des commandes plus vieilles, garde les récentes", async () => {
  const db = new MemPurgeDb([
    { createdAt: old(45), firstName: "Amina", phone: "0470123456" },
    { createdAt: old(31), firstName: "Karim", phone: "0498765432" },
    { createdAt: old(10), firstName: "Léa", phone: "0471000000" },
  ]);
  const r = await runPurge(db, NOW);
  assert.equal(r.candidates, 2);
  assert.equal(r.erased, 2);
  assert.deepEqual(db.rows.map((x) => [x.firstName, x.phone]), [[ERASED_NAME, null], [ERASED_NAME, null], ["Léa", "0471000000"]]);
});

test("runPurge : une seconde passe ne trouve plus rien (idempotent)", async () => {
  const db = new MemPurgeDb([{ createdAt: old(60), firstName: "Amina", phone: "0470123456" }]);
  await runPurge(db, NOW);
  const again = await runPurge(db, NOW);
  assert.equal(again.candidates, 0);
  assert.equal(again.erased, 0);
  assert.equal(db.erasedCalls, 1);
});

test("runPurge : à blanc, compte sans rien effacer", async () => {
  const db = new MemPurgeDb([{ createdAt: old(60), firstName: "Amina", phone: "0470123456" }]);
  const r = await runPurge(db, NOW, undefined, true);
  assert.equal(r.dryRun, true);
  assert.equal(r.candidates, 1);
  assert.equal(r.erased, 0);
  assert.equal(db.rows[0].phone, "0470123456");
  assert.equal(db.erasedCalls, 0);
});

test("runPurge : le réglage de durée est suivi, et un réglage illisible est dit", async () => {
  const db = new MemPurgeDb([{ createdAt: old(20), firstName: "Amina", phone: "0470123456" }]);
  assert.equal((await runPurge(db, NOW, "30")).candidates, 0);
  assert.equal((await runPurge(db, NOW, "10")).erased, 1);
  const bad = await runPurge(new MemPurgeDb([]), NOW, "xx");
  assert.equal(bad.invalidSetting, true);
  assert.equal(bad.days, 30);
});

test("runPurge : tables absentes = rien à purger, dit clairement", async () => {
  const r = await runPurge(new MemPurgeDb([], true), NOW);
  assert.deepEqual([r.unavailable, r.candidates, r.erased], [true, 0, 0]);
});

test("runPurge : une panne remonte (le cron échoue, jamais un échec silencieux)", async () => {
  const db = new MemPurgeDb([{ createdAt: old(60), firstName: "A", phone: "0470123456" }]);
  db.erase = async () => { throw new Error("boom"); };
  await assert.rejects(() => runPurge(db, NOW), /boom/);
});
