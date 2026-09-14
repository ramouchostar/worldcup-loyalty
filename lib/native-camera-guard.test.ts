import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APP_CLOSED_WINDOW_MS,
  clearNativeCameraMark,
  consumeAppClosedDuringCamera,
  markNativeCameraOpened,
} from "./native-camera-guard";

function memoryStore() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    size: () => m.size,
  };
}

test("aucune marque : la page n'a pas été fermée", () => {
  assert.equal(consumeAppClosedDuringCamera(memoryStore(), 1_000), false);
});

test("marque récente au montage : l'app a été fermée pendant la photo, une seule fois", () => {
  const s = memoryStore();
  markNativeCameraOpened(s, 10_000);
  assert.equal(consumeAppClosedDuringCamera(s, 40_000), true);
  assert.equal(consumeAppClosedDuringCamera(s, 41_000), false);
});

test("page revenue à la vie : la marque effacée ne déclenche rien", () => {
  const s = memoryStore();
  markNativeCameraOpened(s, 10_000);
  clearNativeCameraMark(s);
  assert.equal(consumeAppClosedDuringCamera(s, 20_000), false);
});

test("marque trop vieille ou dans le futur : ignorée et nettoyée", () => {
  const s = memoryStore();
  markNativeCameraOpened(s, 0);
  assert.equal(consumeAppClosedDuringCamera(s, APP_CLOSED_WINDOW_MS + 1), false);
  assert.equal(s.size(), 0);
  markNativeCameraOpened(s, 50_000);
  assert.equal(consumeAppClosedDuringCamera(s, 10_000), false);
});

test("stockage indisponible : jamais d'erreur", () => {
  const broken = {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); },
    removeItem: () => { throw new Error("blocked"); },
  };
  assert.doesNotThrow(() => markNativeCameraOpened(broken, 1));
  assert.doesNotThrow(() => clearNativeCameraMark(broken));
  assert.equal(consumeAppClosedDuringCamera(broken, 2), false);
  assert.equal(consumeAppClosedDuringCamera(null, 2), false);
});
