import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LOCALES, getT } from "./index";
import { fr } from "./messages/fr";
import { MISSION_STATUSES } from "../mission-states";
import { STATUS_VIEW, TIMELINE_STEPS, STUDIO_TIMELINE_STEPS, briefRows } from "../mission-view";
import { VIDEO_TEMPLATE } from "../mission-brief";

// ADR 0084 §5 terdecies — le côté restaurateur : sa langue, ses pages.

test("chaque état d'une mission a son nom côté restaurateur et côté prestataire, dans les trois langues", () => {
  for (const s of MISSION_STATUSES) {
    assert.ok(`status.restaurant.${s}` in fr, s);
    assert.ok(`status.provider.${s}` in fr, s);
  }
  // Le français est celui d'avant.
  for (const s of MISSION_STATUSES) assert.equal(getT("fr").t(`status.restaurant.${s}` as never), STATUS_VIEW[s].label, s);
});

test("chaque étape de la frise a son texte, et le français est celui d'avant", () => {
  const tr = getT("fr");
  for (const step of TIMELINE_STEPS) assert.equal(tr.t(`rest.tl.${step.key}` as never), step.label, step.key);
  for (const step of STUDIO_TIMELINE_STEPS) {
    const key = step.key === "production" ? "creation" : step.key;
    assert.equal(tr.t(`rest.tl.${key}` as never), step.label, step.key);
  }
});

test("le brief se lit dans la langue du lecteur : dates, « oui », budget", () => {
  const answers = { goal: "Nouveau plat", deciders_attested: true, budget_cents: 80_000 };
  const flat = (rows: { label: string; value: string }[], label: string) => rows.find((r) => r.label === label)?.value.replace(/\s/g, " ");
  const fr = briefRows(answers, VIDEO_TEMPLATE, "brief", "fr");
  const nl = briefRows(answers, VIDEO_TEMPLATE, "brief", "nl");
  const en = briefRows(answers, VIDEO_TEMPLATE, "brief", "en");
  assert.equal(flat(fr, "Tous ont validé ce brief"), "Oui");
  assert.equal(flat(nl, "Tous ont validé ce brief"), "Ja");
  assert.equal(flat(en, "Tous ont validé ce brief"), "Yes");
  assert.equal(flat(fr, "Budget"), "800 €");
  assert.equal(flat(en, "Budget"), "€800");
  // Appel sans langue (anciens appelants) : le français, comme avant.
  assert.deepEqual(briefRows(answers, VIDEO_TEMPLATE), fr);
});

test("la langue du restaurateur est celle de SON compte : migration nullable, route et page, lecture à part", () => {
  const sql = readFileSync("docs/migrations/20261021-1400-restaurateur-langue.sql", "utf8");
  assert.match(sql, /ADD COLUMN IF NOT EXISTS locale TEXT;/);
  assert.match(sql, /locale IS NULL OR locale IN \('fr', 'nl', 'en'\)/);
  assert.doesNotMatch(sql, /locale TEXT NOT NULL/);
  const route = readFileSync("app/api/admin/langue/route.ts", "utf8");
  assert.match(route, /saveUserLocale\(user\.id,/);
  assert.doesNotMatch(route, /body\??\.(id|user)/);
  const guard = readFileSync("lib/admin-guard.ts", "utf8");
  assert.doesNotMatch(guard, /locale/);
  const layout = readFileSync("app/admin/[restaurantId]/prestataires/layout.tsx", "utf8");
  assert.match(layout, /getUserLocale\(user\.id\)/);
  assert.match(layout, /\/api\/admin\/langue/);
});

test("chaque métier a son libellé de prestataire dans les trois langues", () => {
  for (const l of LOCALES) for (const m of ["video", "photo", "design", "impression"]) {
    assert.ok(getT(l).t(`rest.who.${m}` as never).length > 3);
    assert.ok(getT(l).t(`rest.whoCap.${m}` as never)[0] === getT(l).t(`rest.whoCap.${m}` as never)[0].toUpperCase());
  }
});
