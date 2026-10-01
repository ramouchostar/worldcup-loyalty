import { test } from "node:test";
import assert from "node:assert/strict";
import { auditSignupHref, decodeAttribution, encodeAttribution, readAttribution } from "./partner-attribution";

const NOW = new Date("2026-10-01T10:00:00Z");

test("le lien du rapport d'audit porte ses UTM et l'identifiant du rapport", () => {
  const href = auditSignupHref("3f2a9c1e-0000-4000-8000-000000000001");
  const a = readAttribution(new URL(href, "https://boosteats.tech").searchParams, "/become-a-partner", NOW);
  assert.equal(a?.utm_source, "audit");
  assert.equal(a?.utm_medium, "rapport");
  assert.equal(a?.utm_content, "3f2a9c1e-0000-4000-8000-000000000001");
});

test("ancien lien `?source=audit` (rapports déjà envoyés) reconnu comme audit", () => {
  const a = readAttribution(new URLSearchParams("source=audit"), "/become-a-partner", NOW);
  assert.equal(a?.utm_source, "audit");
});

test("sans paramètre d'attribution, rien n'est retenu", () => {
  assert.equal(readAttribution(new URLSearchParams("as=resto"), "/signup", NOW), null);
});

test("valeur douteuse ignorée", () => {
  const a = readAttribution(new URLSearchParams("utm_source=audit&utm_content=<script>"), "/signup", NOW);
  assert.equal(a?.utm_content, undefined);
});

test("aller-retour dans le cookie", () => {
  const a = readAttribution(new URLSearchParams("utm_source=audit&utm_campaign=x"), "/signup", NOW)!;
  assert.deepEqual(decodeAttribution(encodeAttribution(a)), a);
  assert.equal(decodeAttribution("pas-du-json"), null);
  assert.equal(decodeAttribution(undefined), null);
});
