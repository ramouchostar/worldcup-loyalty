import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { computeImagePhash } from "./image-phash-server";
import { hammingDistanceHex } from "./image-phash";
import { PHASH_DUPLICATE_MAX, PHASH_REVIEW_MAX } from "./duplicate-detection";

// La propriété qui décide de tout : deux photos du MÊME ticket doivent tomber
// sous PHASH_DUPLICATE_MAX, deux tickets DIFFÉRENTS doivent dépasser
// PHASH_REVIEW_MAX. On la vérifie sur de vraies images encodées, passées par le
// même pipeline qu'en production (sharp → 32×32 gris → DCT), et non sur des
// motifs synthétiques dont le résultat dépendrait du motif choisi.

const W = 420;
const H = 900;

/**
 * Un faux ticket de caisse : fond blanc, bandes noires de largeurs variables,
 * comme les lignes d'articles d'un reçu thermique. `seed` change la mise en
 * page — c'est ce qui distingue deux tickets.
 */
function fakeReceipt(seed: number): Buffer {
  const px = Buffer.alloc(W * H, 245); // fond clair
  // Générateur déterministe (pas de Math.random : un test doit être rejouable).
  let state = seed * 2654435761;
  const next = () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
  let y = 40;
  while (y < H - 40) {
    const height = 6 + Math.floor(next() * 10);
    const left = 30 + Math.floor(next() * 60);
    const right = W - 30 - Math.floor(next() * 160);
    for (let ligne = y; ligne < Math.min(y + height, H); ligne++) {
      px.fill(25, ligne * W + left, ligne * W + right);
    }
    y += height + 10 + Math.floor(next() * 22);
  }
  return px;
}

function toPng(px: Buffer): Promise<Buffer> {
  return sharp(px, { raw: { width: W, height: H, channels: 1 } }).png().toBuffer();
}

/**
 * La même scène « rephotographiée » : recadrage léger, changement d'exposition,
 * ré-encodage JPEG lossy. C'est ce que produit un membre qui reprend son ticket
 * en photo — jamais les mêmes octets, la même structure.
 */
function secondShot(px: Buffer): Promise<Buffer> {
  return sharp(px, { raw: { width: W, height: H, channels: 1 } })
    .extract({ left: 6, top: 12, width: W - 12, height: H - 24 })
    .resize(W, H, { fit: "fill" })
    .modulate({ brightness: 1.15 })
    .blur(0.6)
    .jpeg({ quality: 62 })
    .toBuffer();
}

test("deux photos du même ticket tombent sous le seuil de doublon", async () => {
  const px = fakeReceipt(7);
  const [a, b] = await Promise.all([
    computeImagePhash(await toPng(px)),
    computeImagePhash(await secondShot(px)),
  ]);
  assert.ok(a && b, "les deux hachages doivent être calculés");
  const d = hammingDistanceHex(a, b);
  assert.ok(
    d !== null && d <= PHASH_DUPLICATE_MAX,
    `distance ${d} — attendue ≤ ${PHASH_DUPLICATE_MAX} pour deux prises du même ticket`
  );
});

test("deux tickets différents dépassent largement le seuil de vérification", async () => {
  const [a, b] = await Promise.all([
    computeImagePhash(await toPng(fakeReceipt(7))),
    computeImagePhash(await toPng(fakeReceipt(91))),
  ]);
  assert.ok(a && b);
  const d = hammingDistanceHex(a, b);
  assert.ok(
    d !== null && d > PHASH_REVIEW_MAX,
    `distance ${d} — attendue > ${PHASH_REVIEW_MAX} pour deux tickets distincts`
  );
});

test("le hachage ne dépend pas du format d'encodage", async () => {
  const px = fakeReceipt(23);
  const raw = sharp(px, { raw: { width: W, height: H, channels: 1 } });
  const [png, jpeg, webp] = await Promise.all([
    raw.clone().png().toBuffer(),
    raw.clone().jpeg({ quality: 90 }).toBuffer(),
    raw.clone().webp({ quality: 90 }).toBuffer(),
  ]);
  const [hp, hj, hw] = await Promise.all([png, jpeg, webp].map(computeImagePhash));
  assert.ok(hp && hj && hw);
  assert.ok(hammingDistanceHex(hp, hj)! <= 2);
  assert.ok(hammingDistanceHex(hp, hw)! <= 2);
});

test("une entrée indécodable renvoie null au lieu de lever", async () => {
  assert.equal(await computeImagePhash(Buffer.from("ceci n'est pas une image")), null);
  assert.equal(await computeImagePhash(Buffer.alloc(0)), null);
});
