import assert from "node:assert/strict";
import { test } from "node:test";
import { commanderColors, commanderStyle, contrast } from "./theme";

test("sans couleur (ou couleur illisible) : l'olive Boosteats, texte blanc", () => {
  for (const primary of [null, undefined, "", "rouge", "#12"]) {
    const c = commanderColors(primary);
    assert.equal(c.accent, "#6B7C3F", String(primary));
    assert.equal(c.onAccent, "#FFFFFF");
  }
});

test("toute couleur de restaurant reste lisible : texte sur le bouton et lien sur fond clair à 4,5:1, bord à 3:1", () => {
  const colors = ["#C8102E", "#F5A623", "#FFE600", "#FFFFFF", "#000000", "#777777", "#2F5D8A", "#A9BB6E", "#808080", "#7F7F00"];
  for (const primary of colors) {
    const c = commanderColors(primary);
    assert.ok(contrast(c.accent, c.onAccent) >= 4.5, `${primary} bouton`);
    assert.ok(contrast(c.accentText, "#F0F0EC") >= 4.5, `${primary} lien`);
    assert.ok(contrast(c.accentEdge, "#FFFFFF") >= 3, `${primary} bord`);
  }
});

test("la police choisie par le restaurant est posée ; sans choix, Instrument Sans", () => {
  const vars = (s: object) => s as Record<string, string>;
  assert.equal(vars(commanderStyle({ brand_font: "poppins" }))["--brand-font"], "var(--font-poppins)");
  assert.match(vars(commanderStyle(null))["--brand-font"], /^var\(--font-instrument\)/);
  assert.match(vars(commanderStyle({ brand_font: "comic" }))["--brand-display-font"], /^var\(--font-instrument\)/);
});
