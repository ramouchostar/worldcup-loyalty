import { test } from "node:test";
import assert from "node:assert/strict";
import { isProgramQrPayload } from "./poster-detect";

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
