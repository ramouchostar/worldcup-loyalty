import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { preparePhoto } from "./photo";
import { PHOTO_MAX_BYTES } from "./types";

const base = (width: number, height: number) => sharp({ create: { width, height, channels: 4, background: { r: 120, g: 90, b: 40, alpha: 0.5 } } });

test("la photo est réenregistrée en JPEG, sans position GPS ni aucune métadonnée, redressée et réduite", async () => {
  const input = await base(2400, 1200)
    .withExif({ IFD0: { Make: "TelephoneDeTest", Orientation: "6" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "50/1 51/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "4/1 21/1 0/1" } })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
  const before = await sharp(input).metadata();
  assert.ok(before.exif, "l'image de test doit porter des métadonnées");

  const out = await preparePhoto(input);
  assert.ok(out.ok);
  const meta = await sharp(out.data).metadata();
  assert.equal(meta.format, "jpeg");
  assert.equal(meta.exif, undefined);
  assert.equal(meta.xmp, undefined);
  assert.equal(meta.iptc, undefined);
  assert.equal(meta.icc, undefined);
  assert.equal(meta.orientation, undefined);
  // Orientation 6 : couchée à la prise, debout après ; plus grand côté ramené à 1 600.
  assert.deepEqual([meta.width, meta.height], [800, 1600]);
  assert.equal(out.data.includes(Buffer.from("TelephoneDeTest")), false);
});

test("PNG et WebP sont acceptés ; le reste est refusé d'après le contenu", async () => {
  for (const input of [await base(40, 40).png().toBuffer(), await base(40, 40).webp().toBuffer()]) assert.equal((await preparePhoto(input)).ok, true);
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
  const gif = await base(10, 10).gif().toBuffer();
  for (const input of [svg, gif, Buffer.from("pas une image"), Buffer.alloc(0), Buffer.alloc(PHOTO_MAX_BYTES + 1)]) assert.equal((await preparePhoto(input)).ok, false);
});
