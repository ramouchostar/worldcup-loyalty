import { test } from "node:test";
import assert from "node:assert/strict";
import { isProgramQrPayload, showsProgramQr, type QrDetector } from "./poster-detect";

// Le viseur de la caméra (ADR 0056 §5) et le contrôle après la photo passent
// par showsProgramQr : un détecteur factice suffit, la décision est ici.
const detectorReturning = (values: string[]): QrDetector => ({
  detect: async () => values.map((rawValue) => ({ rawValue })),
});
const image = {} as ImageBitmapSource;

test("viseur : le QR de l'affiche est repéré, même parmi d'autres codes", async () => {
  assert.equal(
    await showsProgramQr(detectorReturning(["https://worldcup-loyalty.vercel.app/r/kraainem?utm_source=qr_code"]), image),
    true
  );
  assert.equal(
    await showsProgramQr(detectorReturning(["https://g.page/r/xyz/review", "https://worldcup-loyalty.vercel.app/join?ref=A1"]), image),
    true
  );
});

test("viseur : ticket avec son QR d'avis, aucun code ou détecteur en panne → jamais bloqué", async () => {
  assert.equal(await showsProgramQr(detectorReturning(["https://feedback.example.com/rate?store=223"]), image), false);
  assert.equal(await showsProgramQr(detectorReturning([]), image), false);
  const broken: QrDetector = { detect: async () => { throw new Error("image illisible"); } };
  assert.equal(await showsProgramQr(broken, image), false);
});

test("QR d'affiche et de vitrine → programme reconnu", () => {
  assert.equal(
    isProgramQrPayload("https://worldcup-loyalty.vercel.app/r/kraainem?utm_source=qr_code&utm_medium=print&utm_campaign=loyalty_signup"),
    true
  );
  assert.equal(isProgramQrPayload("https://worldcup-loyalty.vercel.app/r/kraainem"), true);
  assert.equal(isProgramQrPayload("HTTPS://WORLDCUP-LOYALTY.VERCEL.APP/JOIN?REF=ABC123"), true);
});

test("QR d'avis du ticket de caisse ou étranger → jamais bloqué", () => {
  // Le bas des tickets Kraainem porte un QR « rate your experience » : il ne
  // pointe pas vers l'app — une photo de ticket complet ne doit JAMAIS être
  // refusée par ce verrou.
  assert.equal(isProgramQrPayload("https://feedback.example.com/rate?store=223"), false);
  assert.equal(isProgramQrPayload("https://g.page/r/xyz/review"), false);
  assert.equal(isProgramQrPayload("BEID:0847112183"), false);
  assert.equal(isProgramQrPayload(""), false);
  assert.equal(isProgramQrPayload(null), false);
});
