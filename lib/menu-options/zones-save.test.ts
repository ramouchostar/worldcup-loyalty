import assert from "node:assert/strict";
import { test } from "node:test";
import { checkZones, saveZones, type ZoneRow, type ZoneTraceRow, type ZonesDb } from "./zones-save";

class MemZonesDb implements ZonesDb {
  written: ZoneRow[] = [];
  traces: ZoneTraceRow[] = [];
  constructor(private mine: string[], private column = true, private table = true) {}
  async ownedIds(_r: string, ids: string[]) { return new Set(ids.filter((i) => this.mine.includes(i))); }
  async writeZones(_r: string, rows: ZoneRow[]) { if (!this.column) return false; this.written.push(...rows); return true; }
  async writeTrace(row: ZoneTraceRow) { if (!this.table) return false; this.traces.push(row); return true; }
}

test("checkZones : nom nettoyé, vide = pas de coin, doublon et forme refusés", () => {
  const ok = checkZones([{ articleId: "a", zone: "  Pizza  four " }, { articleId: "b", zone: "  " }, { articleId: "c", zone: null }]);
  assert.ok(ok.ok);
  if (ok.ok) assert.deepEqual(ok.rows.map((r) => r.zone), ["Pizza four", null, null]);
  assert.equal(checkZones([]).ok, false);
  assert.equal(checkZones("x").ok, false);
  assert.equal(checkZones([{ articleId: "a", zone: "x" }, { articleId: "a", zone: "y" }]).ok, false);
  assert.equal(checkZones([{ articleId: "a", zone: 4 }]).ok, false);
  assert.equal(checkZones([{ zone: "x" }]).ok, false);
});

test("checkZones : plus de 8 coins différents refusé, 8 acceptés", () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ articleId: `a${i}`, zone: `Coin ${i}` }));
  assert.equal(checkZones(rows(8)).ok, true);
  assert.equal(checkZones(rows(9)).ok, false);
});

test("saveZones : écrit, compte les coins, trace", async () => {
  const db = new MemZonesDb(["a", "b", "c"]);
  const out = await saveZones(db, "r1", [{ articleId: "a", zone: "Pizza" }, { articleId: "b", zone: "Pizza" }, { articleId: "c", zone: "Grill" }], { suggested: 3, suggestedKept: 2, changed: 1, cleared: 0, bogus: -1 }, "u1");
  assert.deepEqual(out, { ok: true, rows: 3, traceSaved: true });
  assert.equal(db.traces[0].zones, 2);
  assert.equal(db.traces[0].suggested_kept, 2);
  assert.equal(db.traces[0].changed, 1);
});

test("saveZones : un plat d'un autre établissement refuse tout", async () => {
  const db = new MemZonesDb(["a"]);
  const out = await saveZones(db, "r1", [{ articleId: "a", zone: "Pizza" }, { articleId: "x", zone: "Pizza" }], {}, "u1");
  assert.equal(out.ok, false);
  if (!out.ok) assert.equal(out.status, 400);
  assert.equal(db.written.length, 0);
});

test("saveZones : migration absente = 503 clair ; trace absente = résultat qui le dit", async () => {
  const none = await saveZones(new MemZonesDb(["a"], false), "r1", [{ articleId: "a", zone: "Pizza" }], {}, "u1");
  assert.equal(none.ok, false);
  if (!none.ok) {
    assert.equal(none.status, 503);
    assert.match(none.error, /pas encore activés/);
  }
  const noTrace = await saveZones(new MemZonesDb(["a"], true, false), "r1", [{ articleId: "a", zone: "Pizza" }], {}, "u1");
  assert.deepEqual(noTrace, { ok: true, rows: 1, traceSaved: false });
});

test("saveZones : un coin vidé est bien écrit (null)", async () => {
  const db = new MemZonesDb(["a"]);
  await saveZones(db, "r1", [{ articleId: "a", zone: null }], {}, "u1");
  assert.deepEqual(db.written, [{ articleId: "a", zone: null }]);
});
