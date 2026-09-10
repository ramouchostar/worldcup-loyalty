import { test } from "node:test";
import assert from "node:assert/strict";
import { detecteIos } from "./pwa-install";

// iOS = feuille Partager quel que soit le navigateur ; Android/desktop = menu.
test("detecteIos : tous les navigateurs iOS, jamais Android ni desktop", () => {
  assert.equal(detecteIos("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"), true);
  assert.equal(detecteIos("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1"), true); // Chrome iOS
  assert.equal(detecteIos("Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/115.0 Mobile/15E148 Safari/605.1.15"), true); // Firefox iPad
  assert.equal(detecteIos("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36"), false);
  assert.equal(detecteIos("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"), false);
});
