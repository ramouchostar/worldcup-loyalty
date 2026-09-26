import { test } from "node:test";
import assert from "node:assert/strict";
import { hashToken, parseKey, sharePath, slugify, snapshotOf, tokenFor } from "./share";
import type { AuditRow, SectionRow } from "./store";

test("nom lisible dans le lien", () => {
  assert.equal(slugify("Krusty Smash Burgers"), "krusty-smash-burgers");
  assert.equal(slugify("Belchicken Kraainem | Taste Matters"), "belchicken-kraainem-taste-matters");
  assert.equal(slugify("Crêperie L'Été & Co"), "creperie-l-ete-et-co");
  assert.equal(slugify("|||"), "restaurant");
});

test("jeton : 128 bits, stable pour un même lien, différent d'un lien à l'autre", () => {
  const a = tokenFor("11111111-1111-1111-1111-111111111111", "secret");
  assert.match(a, /^[A-Za-z0-9_-]{22}$/);
  assert.equal(a, tokenFor("11111111-1111-1111-1111-111111111111", "secret"));
  assert.notEqual(a, tokenFor("22222222-2222-2222-2222-222222222222", "secret"));
  assert.notEqual(a, tokenFor("11111111-1111-1111-1111-111111111111", "autre"));
  assert.match(hashToken(a), /^[0-9a-f]{64}$/);
});

test("lien : /audit/<nom>/v<N>-<jeton>, relu à l'identique", () => {
  const t = tokenFor("x", "secret");
  const p = sharePath("Krusty Smash Burgers", 2, t);
  assert.equal(p, `/audit/krusty-smash-burgers/v2-${t}`);
  assert.deepEqual(parseKey(p.split("/").pop()!), { version: 2, token: t });
  assert.equal(parseKey("v2-court"), null);
  assert.equal(parseKey(t), null);
});

test("instantané : ni coût, ni auteur, ni volet en échec", () => {
  const audit = { id: "a", name: "R", cost_usd: 0.4, calls: { dataforseo: 3 }, created_by: "u", status: "revise" } as unknown as AuditRow;
  const sec = (section: SectionRow["section"], status: SectionRow["status"]) => ({ section, status, raw: { big: true }, result: { ok: 1 }, error: status === "echec" ? "motif" : null }) as unknown as SectionRow;
  const snap = snapshotOf(audit, [sec("fiche", "ok"), sec("concurrents", "ok"), sec("seo", "echec")]);
  assert.equal("cost_usd" in snap.audit, false);
  assert.equal("created_by" in snap.audit, false);
  assert.deepEqual(snap.sections.map((x) => x.section), ["fiche", "concurrents"]);
  assert.deepEqual(snap.sections[0].raw, { big: true });
  assert.equal(snap.sections[1].raw, null);
});
