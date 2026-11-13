import assert from "node:assert/strict";
import { test } from "node:test";
import { checkRows, saveReviews, type PdfDb, type PdfRowIn, type PdfTraceRow } from "./pdf-save";

class MemPdfDb implements PdfDb {
  written: PdfRowIn[] = [];
  traces: PdfTraceRow[] = [];
  constructor(private mine: string[], private columns = true, private traceTable = true) {}
  async ownedIds(_r: string, ids: string[]) { return new Set(ids.filter((i) => this.mine.includes(i))); }
  async writeRows(_r: string, rows: PdfRowIn[]) { if (!this.columns) return false; this.written.push(...rows); return true; }
  async writeTrace(row: PdfTraceRow) { if (!this.traceTable) return false; this.traces.push(row); return true; }
}

const row = (articleId: string, o: Partial<PdfRowIn> = {}): PdfRowIn => ({ articleId, description: null, descriptionSource: null, allergens: null, ...o });

test("checkRows : forme, doublons, allergène inconnu, description trop longue ou sans origine", () => {
  assert.equal(checkRows("x").ok, false);
  assert.equal(checkRows([]).ok, false);
  assert.equal(checkRows([row("a", { allergens: ["gluten"] }), row("a", { allergens: ["lait"] })]).ok, false);
  assert.equal(checkRows([{ articleId: "a", allergens: ["pomme"] }]).ok, false);
  assert.equal(checkRows([{ articleId: "a", description: "x".repeat(301), descriptionSource: "pdf" }]).ok, false);
  assert.equal(checkRows([{ articleId: "a", description: "Bœuf", descriptionSource: "generated" }]).ok, false);
  assert.equal(checkRows([{ articleId: "a", description: "Bœuf" }]).ok, false);
});

test("checkRows : une ligne sans rien à écrire est ignorée ; tout ignoré = refus clair", () => {
  const r = checkRows([row("a"), row("b", { allergens: [] })]);
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.rows.map((x) => x.articleId), ["b"]); // [] = « aucun », confirmé : c'est un fait écrit
  const none = checkRows([row("a")]);
  assert.equal(none.ok, false);
});

test("checkRows : balises retirées, espaces repliés, doublons d'allergènes retirés", () => {
  const r = checkRows([{ articleId: "a", description: "  <i>Bœuf</i>   grillé ", descriptionSource: "restaurateur", allergens: ["lait", "lait"] }]);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.rows[0].description, "iBœuf/i grillé");
    assert.deepEqual(r.rows[0].allergens, ["lait"]);
  }
});

test("saveReviews : écrit, compte, trace", async () => {
  const db = new MemPdfDb(["a", "b"]);
  const out = await saveReviews(db, "r1", [row("a", { description: "Bœuf", descriptionSource: "pdf", allergens: ["gluten"] }), row("b", { allergens: [] })], { linesRead: 5, matched: 2, allergensConfirmed: 2, bogus: -4 }, "u1");
  assert.deepEqual(out, { ok: true, rows: 2, traceSaved: true });
  assert.equal(db.written.length, 2);
  assert.equal(db.traces[0].lines_read, 5);
  assert.equal(db.traces[0].rows_written, 2);
  assert.equal(db.traces[0].allergens_confirmed, 2);
});

test("saveReviews : un plat d'un autre établissement refuse tout, rien n'est écrit", async () => {
  const db = new MemPdfDb(["a"]);
  const out = await saveReviews(db, "r1", [row("a", { allergens: [] }), row("intrus", { allergens: [] })], {}, "u1");
  assert.equal(out.ok, false);
  if (!out.ok) assert.equal(out.status, 400);
  assert.equal(db.written.length, 0);
});

test("saveReviews : migration absente = 503 dit clairement, rien d'écrit", async () => {
  const db = new MemPdfDb(["a"], false);
  const out = await saveReviews(db, "r1", [row("a", { allergens: [] })], {}, "u1");
  assert.equal(out.ok, false);
  if (!out.ok) {
    assert.equal(out.status, 503);
    assert.match(out.error, /pas encore activé/);
  }
});

test("saveReviews : la trace manquante ne bloque pas, et le résultat le dit", async () => {
  const db = new MemPdfDb(["a"], true, false);
  const out = await saveReviews(db, "r1", [row("a", { allergens: ["soja"] })], {}, "u1");
  assert.deepEqual(out, { ok: true, rows: 1, traceSaved: false });
});

test("saveReviews : une panne de lecture des plats remonte en 500 avec son détail", async () => {
  const db = new MemPdfDb(["a"]);
  db.ownedIds = async () => { throw new Error("boom"); };
  const out = await saveReviews(db, "r1", [row("a", { allergens: [] })], {}, "u1");
  assert.equal(out.ok, false);
  if (!out.ok) {
    assert.equal(out.status, 500);
    assert.equal(out.detail, "boom");
  }
});
