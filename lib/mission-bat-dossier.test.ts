import { test } from "node:test";
import assert from "node:assert/strict";
import { batDossier, signatureView, PHASE_SUMMARY, type DossierProof } from "./mission-bat-dossier";
import { batChecklist } from "./mission-print";

const brief = { qr_url: "https://exemple.be/menu", quantity: "500", product: "Flyers", size: "A5" };
const checklist = batChecklist(brief);
const proof = (o: Partial<DossierProof>): DossierProof => ({ round: 1, status: "proposed", links: ["https://exemple.be/bat1.pdf"], message: null, corrections: null, signedName: null, checks: null, sentAt: "2026-10-20T10:00:00Z", decidedAt: null, signedAt: null, ...o });
const allChecked = Object.fromEntries(checklist.map((c) => [c.key, true]));

test("aucune épreuve : le dossier le dit", () => {
  const d = batDossier([], checklist);
  assert.equal(d.phase, "none");
  assert.equal(d.summary, PHASE_SUMMARY.none);
  assert.deepEqual(d.proofs, []);
});

test("épreuve en attente puis corrections : rien n'est signé", () => {
  assert.equal(batDossier([proof({})], checklist).phase, "awaiting_review");
  const d = batDossier([proof({ status: "corrections", corrections: [{ category: "Prix", text: "9,50 et non 9,05" }] }), proof({ round: 2 })], checklist);
  assert.equal(d.phase, "awaiting_review");
  assert.equal(d.proofs[0].signature, null);
  assert.equal(d.proofs[0].statusText, "Corrections demandées");
});

test("épreuve signée : nom, instant et chaque point vérifié", () => {
  const signed = proof({ round: 2, status: "signed", signedName: "Omar A.", signedAt: "2026-10-21T09:00:00Z", checks: allChecked });
  const s = signatureView(signed, checklist);
  assert.ok(s);
  assert.equal(s.name, "Omar A.");
  assert.equal(s.allTicked, true);
  assert.equal(s.ticked.length, checklist.length);
  assert.equal(batDossier([proof({ status: "corrections" }), signed], checklist).phase, "signed");
});

test("un point non coché se voit", () => {
  const s = signatureView(proof({ status: "signed", signedName: "Omar A.", signedAt: "2026-10-21T09:00:00Z", checks: { ...allChecked, qr: false } }), checklist);
  assert.equal(s?.allTicked, false);
  assert.equal(s?.ticked.find((t) => t.label.includes("QR"))?.done, false);
});

test("pas de signature à afficher pour une épreuve non signée ou sans nom", () => {
  assert.equal(signatureView(proof({}), checklist), null);
  assert.equal(signatureView(proof({ status: "signed" }), checklist), null);
});

test("les épreuves sortent dans l'ordre des tours", () => {
  const d = batDossier([proof({ round: 3 }), proof({ round: 1 }), proof({ round: 2 })], checklist);
  assert.deepEqual(d.proofs.map((p) => p.round), [1, 2, 3]);
});
