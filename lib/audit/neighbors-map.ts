// ADR 0069 §3 C — la carte « Face aux voisins » : le restaurant, ses
// concurrents avec leur note Google, et son rang depuis les 8 points de la
// grille, posés sur un vrai fond de carte.
//
// Pur et testé : le cadrage (centre + zoom entier, exigé par Google Static
// Maps), la projection Web Mercator, le décalage des étiquettes qui se
// chevauchent, et les cercles de distance du fond de secours. La route
// /api/audit/carte/[id] et le composant utilisent le MÊME cadrage : le fond
// et les épingles tombent au même endroit.

import type { CompetitorsResult, GridCell } from "./competitors";

/** Taille logique de la carte (Google Static Maps : 640 max, rendu en scale=2). */
export const MAP_SIZE = 560;
const PAD = 44;
const MIN_ZOOM = 13;
const MAX_ZOOM = 16;
/** Au-delà, un concurrent n'élargit plus le cadre : il est épinglé au bord. */
const FIT_RADIUS_M = 800;

export interface LatLng {
  lat: number;
  lng: number;
}
export interface Frame extends LatLng {
  zoom: number;
}

function world(p: LatLng, zoom: number) {
  const scale = 256 * 2 ** zoom;
  const s = Math.sin((p.lat * Math.PI) / 180);
  return {
    x: ((p.lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale,
  };
}

/** Position en pixels logiques dans une carte MAP_SIZE × MAP_SIZE. */
export function project(frame: Frame, p: LatLng, size = MAP_SIZE) {
  const c = world(frame, frame.zoom);
  const w = world(p, frame.zoom);
  return { x: size / 2 + (w.x - c.x), y: size / 2 + (w.y - c.y) };
}

/** Le plus grand zoom entier où tous les points tiennent avec une marge. */
export function fitFrame(center: LatLng, points: LatLng[], size = MAP_SIZE): Frame {
  for (let zoom = MAX_ZOOM; zoom > MIN_ZOOM; zoom--) {
    const f = { ...center, zoom };
    const fits = points.every((p) => {
      const { x, y } = project(f, p, size);
      return x >= PAD && x <= size - PAD && y >= PAD && y <= size - PAD;
    });
    if (fits) return f;
  }
  return { ...center, zoom: MIN_ZOOM };
}

export function isValidFrame(f: Partial<Frame>): f is Frame {
  return (
    typeof f.lat === "number" && typeof f.lng === "number" && typeof f.zoom === "number" &&
    Number.isInteger(f.zoom) && f.zoom >= MIN_ZOOM && f.zoom <= MAX_ZOOM &&
    Math.abs(f.lat) <= 85 && Math.abs(f.lng) <= 180
  );
}

// ─── Étiquettes ─────────────────────────────────────────────────────────────

export interface Box {
  id: string;
  x: number; // centre
  y: number;
  w: number;
  h: number;
  fixed?: boolean;
}

/**
 * Écarte les étiquettes qui se chevauchent (les fixes ne bougent pas), dans
 * les limites de la carte. Simple et déterministe : même entrée, même carte.
 */
export function spread(boxes: Box[], size = MAP_SIZE, gap = 4, rounds = 80): Box[] {
  const out = boxes.map((b) => ({ ...b }));
  for (let r = 0; r < rounds; r++) {
    let moved = false;
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i];
        const b = out[j];
        if (a.fixed && b.fixed) continue;
        const ox = (a.w + b.w) / 2 + gap - Math.abs(a.x - b.x);
        const oy = (a.h + b.h) / 2 + gap - Math.abs(a.y - b.y);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        // On pousse selon l'axe où le chevauchement est le plus petit.
        const alongX = ox < oy;
        const d = alongX ? ox : oy;
        const sign = alongX ? (a.x <= b.x ? -1 : 1) : a.y <= b.y ? -1 : 1;
        const share = a.fixed ? [0, 1] : b.fixed ? [1, 0] : [0.5, 0.5];
        if (alongX) {
          a.x += sign * d * share[0];
          b.x -= sign * d * share[1];
        } else {
          a.y += sign * d * share[0];
          b.y -= sign * d * share[1];
        }
      }
    }
    for (const b of out) {
      if (b.fixed) continue;
      b.x = Math.min(size - b.w / 2 - 2, Math.max(b.w / 2 + 2, b.x));
      b.y = Math.min(size - b.h / 2 - 2, Math.max(b.h / 2 + 2, b.y));
    }
    if (!moved) break;
  }
  return out;
}

// ─── Modèle de la carte ─────────────────────────────────────────────────────

export type Band = "top3" | "top10" | "loin";
export const band = (rank: number | null): Band => (rank != null && rank <= 3 ? "top3" : rank != null && rank <= 10 ? "top10" : "loin");

export interface MapCell {
  x: number;
  y: number;
  rank: number | null;
  band: Band;
}
export interface MapPin {
  /** Place dans Google Maps quand on cherche depuis l'adresse du restaurant. */
  rank: number;
  name: string;
  rating: number | null;
  reviews: number | null;
  distance: number | null;
  /** Point exact, et position de l'étiquette (décalée si elle en chevauchait une autre). */
  at: { x: number; y: number };
  label: { x: number; y: number };
  /** Trop loin pour le cadre : épinglé au bord, dans sa direction. */
  offMap: boolean;
  rival: boolean;
}
export interface NeighborsMap {
  frame: Frame;
  self: { x: number; y: number; rank: number | null; rating: number | null };
  cells: MapCell[];
  pins: MapPin[];
}

export const CELL_D = 40;
export const PIN_W = 74;
export const PIN_H = 28;
export const SELF_W = 150;
export const SELF_H = 34;

const clampToEdge = (p: { x: number; y: number }, size: number, inset = 30) => {
  const c = size / 2;
  const dx = p.x - c;
  const dy = p.y - c;
  const k = Math.min(1, (c - inset) / Math.max(Math.abs(dx), Math.abs(dy), 1));
  return { x: c + dx * k, y: c + dy * k };
};

export function neighborsMap(
  self: LatLng & { rating: number | null },
  comp: Pick<CompetitorsResult, "competitors" | "grid" | "rival">,
  gridPts: (LatLng & { row: number; col: number })[],
  size = MAP_SIZE,
): NeighborsMap {
  const located = comp.competitors.filter((c) => c.latitude != null && c.longitude != null);
  const fitPts: LatLng[] = [
    ...gridPts,
    ...located.filter((c) => (c.distance ?? 0) <= FIT_RADIUS_M).map((c) => ({ lat: c.latitude!, lng: c.longitude! })),
  ];
  const frame = fitFrame(self, fitPts, size);
  const selfXY = project(frame, self, size);
  const center = comp.grid.find((g) => g.row === 0 && g.col === 0);

  const cells: MapCell[] = comp.grid
    .filter((g) => !(g.row === 0 && g.col === 0))
    .map((g) => {
      const p = gridPts.find((q) => q.row === g.row && q.col === g.col);
      const xy = p ? project(frame, p, size) : { x: size / 2 + g.col * 150, y: size / 2 + g.row * 150 };
      return { ...xy, rank: g.rank, band: band(g.rank) };
    });

  const raw = located.map((c) => {
    const at = project(frame, { lat: c.latitude!, lng: c.longitude! }, size);
    const inside = at.x >= 8 && at.x <= size - 8 && at.y >= 8 && at.y <= size - 8;
    return { c, at: inside ? at : clampToEdge(at, size), offMap: !inside };
  });

  const boxes: Box[] = [
    { id: "self", x: selfXY.x, y: selfXY.y, w: SELF_W, h: SELF_H, fixed: true },
    ...cells.map((c, i) => ({ id: `cell${i}`, x: c.x, y: c.y, w: CELL_D, h: CELL_D, fixed: true })),
    // L'étiquette part juste au-dessus du point, comme une épingle.
    ...raw.map((r, i) => ({ id: `pin${i}`, x: r.at.x, y: r.at.y - PIN_H / 2 - 6, w: PIN_W, h: PIN_H })),
  ];
  const placed = spread(boxes, size);

  const pins: MapPin[] = raw.map((r, i) => {
    const b = placed.find((x) => x.id === `pin${i}`)!;
    return {
      rank: r.c.rank,
      name: r.c.title,
      rating: r.c.rating,
      reviews: r.c.reviews,
      distance: r.c.distance,
      at: r.at,
      label: { x: b.x, y: b.y },
      offMap: r.offMap,
      rival: !!comp.rival && comp.rival.cid === r.c.cid,
    };
  });

  return { frame, self: { ...selfXY, rank: center?.rank ?? null, rating: self.rating }, cells, pins };
}

// ─── Qui passe devant, point par point ──────────────────────────────────────

/**
 * Sur les points où le restaurant n'est pas dans les 3 premiers, qui le client
 * voit-il en premier ? Seulement pour les audits qui ont gardé le trio de tête
 * de chaque point (`leaders`, depuis le 2026-09-26).
 */
export function whoOutranks(grid: GridCell[]): { name: string; times: number }[] {
  const counts = new Map<string, number>();
  for (const g of grid) {
    if (g.rank != null && g.rank <= 3) continue;
    for (const l of g.leaders ?? []) counts.set(l.title, (counts.get(l.title) ?? 0) + 1);
  }
  return [...counts.entries()].map(([name, times]) => ({ name, times })).sort((a, b) => b.times - a.times || a.name.localeCompare(b.name));
}

// ─── Fond de secours ────────────────────────────────────────────────────────

/** Rayon en pixels logiques d'un cercle de `meters` autour du centre (cercles 500 m / 1 km). */
export function ringRadius(frame: Frame, meters: number): number {
  const mPerPx = (156543.03392 * Math.cos((frame.lat * Math.PI) / 180)) / 2 ** frame.zoom;
  return meters / mPerPx;
}
