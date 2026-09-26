import { test } from "node:test";
import assert from "node:assert/strict";
import { gridPoints, type Competitor, type GridCell } from "./competitors";
import { band, fitFrame, isValidFrame, MAP_SIZE, neighborsMap, ringRadius, project, spread, whoOutranks, PIN_H, PIN_W } from "./neighbors-map";

const SELF = { lat: 50.864, lng: 4.3327 };
const comp = (over: Partial<Competitor>): Competitor => ({
  rank: 2, cid: "c", title: "C", category: null, rating: 4.5, reviews: 100, address: null, latitude: 50.8637, longitude: 4.3334,
  totalPhotos: 10, isClaimed: true, hasWebsite: true, hasOrderButton: false, priceLevel: null, distance: 62, ...over,
});

test("projection : le centre du cadre tombe au milieu, l'est à droite, le nord en haut", () => {
  const f = { ...SELF, zoom: 15 };
  assert.deepEqual(project(f, SELF), { x: MAP_SIZE / 2, y: MAP_SIZE / 2 });
  const east = project(f, { lat: SELF.lat, lng: SELF.lng + 0.005 });
  const north = project(f, { lat: SELF.lat + 0.005, lng: SELF.lng });
  assert.ok(east.x > MAP_SIZE / 2 && Math.abs(east.y - MAP_SIZE / 2) < 0.01);
  assert.ok(north.y < MAP_SIZE / 2);
});

test("cadrage : la grille de 700 m tient entière, au plus grand zoom possible", () => {
  const pts = gridPoints(SELF.lat, SELF.lng);
  const f = fitFrame(SELF, pts);
  assert.equal(f.zoom, 15);
  for (const p of pts) {
    const { x, y } = project(f, p);
    assert.ok(x > 0 && x < MAP_SIZE && y > 0 && y < MAP_SIZE);
  }
  assert.ok(isValidFrame(f));
  assert.equal(isValidFrame({ ...f, zoom: 15.5 }), false);
  assert.equal(isValidFrame({ ...f, zoom: 3 }), false);
});

test("étiquettes : plus aucun chevauchement, les fixes ne bougent pas", () => {
  const out = spread([
    { id: "moi", x: 280, y: 280, w: 100, h: 34, fixed: true },
    { id: "a", x: 282, y: 270, w: PIN_W, h: PIN_H },
    { id: "b", x: 290, y: 275, w: PIN_W, h: PIN_H },
    { id: "c", x: 285, y: 290, w: PIN_W, h: PIN_H },
  ]);
  assert.deepEqual([out[0].x, out[0].y], [280, 280]);
  for (let i = 0; i < out.length; i++)
    for (let j = i + 1; j < out.length; j++) {
      const a = out[i], b = out[j];
      const overlap = Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
      assert.equal(overlap, false, `${a.id} chevauche ${b.id}`);
    }
});

test("carte : concurrent lointain épinglé au bord, rival marqué, rang central repris", () => {
  const grid: GridCell[] = gridPoints(SELF.lat, SELF.lng).map((p) => ({ row: p.row, col: p.col, rank: p.row === 0 && p.col === 0 ? 1 : 4 }));
  const far = comp({ rank: 9, cid: "far", title: "Loin", latitude: 50.8587, longitude: 4.3541, distance: 1619 });
  const near = comp({ rank: 2, cid: "near", title: "Près" });
  const m = neighborsMap({ ...SELF, rating: 4.7 }, { competitors: [near, far], grid, rival: near }, gridPoints(SELF.lat, SELF.lng));
  assert.equal(m.cells.length, 8);
  assert.equal(m.self.rank, 1);
  const f = m.pins.find((p) => p.name === "Loin")!;
  assert.equal(f.offMap, true);
  assert.ok(f.at.x <= MAP_SIZE && f.at.y <= MAP_SIZE);
  assert.equal(m.pins.find((p) => p.name === "Près")!.rival, true);
});

test("bandes de couleur : 3 premiers, top 10, au-delà", () => {
  assert.deepEqual([band(1), band(3), band(4), band(10), band(11), band(null)], ["top3", "top3", "top10", "top10", "loin", "loin"]);
});

test("qui passe devant : compté seulement là où on n'est pas dans les 3 premiers", () => {
  const L = (t: string) => ({ cid: t, title: t, rank: 1 });
  const out = whoOutranks([
    { row: 0, col: 0, rank: 1, leaders: [L("Quick")] },
    { row: 1, col: 0, rank: 5, leaders: [L("Quick"), L("Snack")] },
    { row: 1, col: 1, rank: null, leaders: [L("Quick")] },
    { row: -1, col: 1, rank: 8 },
  ]);
  assert.deepEqual(out, [{ name: "Quick", times: 2 }, { name: "Snack", times: 1 }]);
});

test("fond de secours : le cercle de 700 m passe par les points de la grille", () => {
  const f = { ...SELF, zoom: 15 };
  const east = gridPoints(SELF.lat, SELF.lng).find((p) => p.row === 0 && p.col === 1)!;
  const { x } = project(f, east);
  assert.ok(Math.abs(x - MAP_SIZE / 2 - ringRadius(f, 700)) < 1);
});
