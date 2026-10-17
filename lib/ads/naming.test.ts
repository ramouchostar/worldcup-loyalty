import { test } from "node:test";
import assert from "node:assert/strict";
import { attachCampaign, campaignName, childMatchesCampaign, freeSegment, parseAdName } from "./naming";

const CLIENTS = new Map([
  ["BE001", "kraainem"],
  ["BE002", "houba"],
  ["BE003", "de-bue"],
]);

test("campagne correcte : rattachée, sans signalement", () => {
  const a = attachCampaign("BE001_kraainem_META_TRAFIC_v1", CLIENTS);
  assert.equal(a.attached, true);
  if (!a.attached) return;
  assert.equal(a.restaurantId, "kraainem");
  assert.equal(a.regie, "META");
  assert.equal(a.objective, "TRAFIC");
  assert.equal(a.parsed.version, 1);
  assert.deepEqual(a.warnings, []);
});

test("identifiant d'établissement à tirets : un seul segment", () => {
  const a = attachCampaign("BE003_de-bue_TIKTOK_UBEREATS_v2", CLIENTS);
  assert.equal(a.attached && a.restaurantId, "de-bue");
});

test("la casse du code et de la régie est tolérée", () => {
  const a = attachCampaign("be002_houba_meta_notoriete_V3", CLIENTS);
  assert.equal(a.attached, true);
  if (a.attached) assert.equal(a.parsed.version, 3);
});

test("code inconnu : non rattachée", () => {
  assert.deepEqual(
    pick(attachCampaign("BE009_kraainem_META_TRAFIC_v1", CLIENTS)),
    { attached: false, problem: "unknown_code" },
  );
});

test("code et établissement incohérents : non rattachée, jamais au hasard", () => {
  assert.deepEqual(
    pick(attachCampaign("BE001_houba_META_TRAFIC_v1", CLIENTS)),
    { attached: false, problem: "establishment_mismatch" },
  );
});

test("mauvais séparateur ou ancienne forme : illisible", () => {
  for (const name of [
    "BE001 | kraainem | TRAFIC | 202610 | test",
    "BEL-HBA_BXL_AWRN_0526",
    "B0042_kraainem_META_VV_v1",
    "BE001-kraainem-META-TRAFIC-v1",
    "",
  ]) {
    assert.deepEqual(pick(attachCampaign(name, CLIENTS)), { attached: false, problem: "separator" }, name);
  }
});

test("objectif ou régie inconnus, version absente : rattachée mais signalée", () => {
  const a = attachCampaign("BE001_kraainem_GOOGLE_PROMO_lancement", CLIENTS);
  assert.equal(a.attached, true);
  if (!a.attached) return;
  assert.equal(a.objective, null);
  assert.deepEqual(a.warnings, ["unknown_regie", "unknown_objective", "missing_version"]);
});

test("un nom de campagne avec un suffixe est signalé", () => {
  const a = attachCampaign("BE001_kraainem_META_TRAFIC_v1_r3km", CLIENTS);
  assert.deepEqual(a.attached && a.warnings, ["prefix_mismatch"]);
});

test("ensemble et publicité : préfixe exact de la campagne + un segment libre", () => {
  const c = "BE001_kraainem_META_TRAFIC_v1";
  assert.equal(childMatchesCampaign("BE001_kraainem_META_TRAFIC_v1_r3km-18-45", c), true);
  assert.equal(childMatchesCampaign("BE001_kraainem_META_TRAFIC_v2_r3km-18-45", c), false);
  assert.equal(childMatchesCampaign("BE001_kraainem_META_TRAFIC_v1_", c), false);
  assert.equal(childMatchesCampaign("BE001_kraainem_META_TRAFIC_v1_r3km_18", c), false);
  assert.equal(parseAdName("BE001_kraainem_META_TRAFIC_v1_crousti-vendredi")?.suffix, "crousti-vendredi");
});

test("nom construit = nom relu", () => {
  const name = campaignName({ clientCode: "BE002", establishment: "houba", regie: "META", objective: "VIDEO", version: 1 });
  assert.equal(name, "BE002_houba_META_VIDEO_v1");
  assert.equal(attachCampaign(name, CLIENTS).attached, true);
  assert.throws(() => campaignName({ clientCode: "BE002", establishment: "a_b", regie: "META", objective: "VIDEO", version: 1 }));
});

test("segment libre : sans accent, sans « _ »", () => {
  assert.equal(freeSegment("Crousti Vendredi_soir"), "crousti-vendredi-soir");
  assert.equal(freeSegment("Rayon 3 km, 18–45 ans"), "rayon-3-km-18-45-ans");
});

function pick(a: ReturnType<typeof attachCampaign>) {
  return a.attached ? { attached: true } : { attached: false, problem: a.problem };
}
