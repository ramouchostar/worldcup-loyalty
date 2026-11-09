import { test } from "node:test";
import assert from "node:assert/strict";
import { judgePhotoQuality, measureGray, shouldBlockPhoto } from "./photo-quality";

const W = 64;
const H = 64;
const fill = (f: (x: number, y: number) => number) =>
  Uint8Array.from({ length: W * H }, (_, i) => f(i % W, Math.floor(i / W)));

test("une photo noire est « dark »", () => {
  assert.equal(judgePhotoQuality(measureGray(fill(() => 0), W, H)), "dark");
});

test("une photo unie et claire est floue (aucun détail)", () => {
  assert.equal(judgePhotoQuality(measureGray(fill(() => 200), W, H)), "blurry");
});

test("un motif net (texte imprimé) est « ok »", () => {
  const damier = fill((x, y) => ((x >> 1) + (y >> 1)) % 2 === 0 ? 30 : 220);
  assert.equal(judgePhotoQuality(measureGray(damier, W, H)), "ok");
});

test("un dégradé très doux est flou, un trait net est ok", () => {
  assert.equal(judgePhotoQuality(measureGray(fill((x) => 100 + x), W, H)), "blurry");
  assert.equal(judgePhotoQuality(measureGray(fill((x) => (x % 8 < 4 ? 40 : 210)), W, H)), "ok");
});

test("une photo sombre mais lisible (luminosité ~50) n'est pas bloquée", () => {
  const sombre = fill((x, y) => ((x >> 1) + (y >> 1)) % 2 === 0 ? 20 : 80);
  assert.equal(judgePhotoQuality(measureGray(sombre, W, H)), "ok");
});

test("une mesure impossible ne bloque jamais", () => {
  assert.equal(judgePhotoQuality(measureGray(new Uint8Array(0), 0, 0)), "ok");
  assert.equal(judgePhotoQuality(measureGray(new Uint8Array(3), 10, 10)), "ok");
});

test("jamais de piège : le premier contrôle raté bloque, le second laisse passer", () => {
  assert.equal(shouldBlockPhoto("blurry", 0), true);
  assert.equal(shouldBlockPhoto("blurry", 1), false);
  assert.equal(shouldBlockPhoto("dark", 0), true);
  assert.equal(shouldBlockPhoto("ok", 0), false);
});
