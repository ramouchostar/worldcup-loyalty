"use client";

import { useEffect, useState } from "react";
import { CELL_D, MAP_SIZE, PIN_H, ringRadius, PIN_W, SELF_H, SELF_W, type NeighborsMap } from "@/lib/audit/neighbors-map";
import s from "./report.module.css";

// ADR 0069 §3 C — la carte « Face aux voisins ». Un SVG unique (fond + épingles)
// qui garde ses proportions à toutes les tailles et à l'impression (PDF).
// Fond Google Static Maps via /api/audit/carte ; s'il ne répond pas, un fond
// neutre avec des cercles de distance (500 m, 1 km) — la console dit pourquoi,
// le gérant voit quand même qui est où. Pas de tuiles tierces : OpenStreetMap
// bloque ce type d'usage (constaté le 2026-09-26, réponse 418).

const fmt1 = (n: number) => n.toLocaleString("fr-BE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const ordinal = (n: number) => (n === 1 ? "1er" : `${n}e`);
const CELL_COLOR = {
  top3: { fill: "#467F3B", text: "#fff" },
  top10: { fill: "#E9C46A", text: "#3D2A05" },
  loin: { fill: "#8A8A82", text: "#fff" },
} as const;

export function NeighborsMapView({ auditId, map, showSourceError }: { auditId: string; map: NeighborsMap; showSourceError: boolean }) {
  const { frame } = map;
  const src = `/api/audit/carte/${auditId}?c=${frame.lat.toFixed(6)},${frame.lng.toFixed(6)}&z=${frame.zoom}`;
  // On sonde le fond avant de l'afficher : un <image> SVG rendu côté serveur
  // peut échouer avant l'hydratation, et son onError ne serait jamais appelé.
  const [bg, setBg] = useState<"attente" | "google" | "secours">("attente");
  useEffect(() => {
    const img = new Image();
    img.onload = () => setBg("google");
    img.onerror = () => setBg("secours");
    img.src = src;
  }, [src]);
  const googleFailed = bg === "secours";

  return (
    <div className={s.mapWrap}>
      <svg viewBox={`0 0 ${MAP_SIZE} ${MAP_SIZE}`} className={s.map} role="img" aria-label="Carte du restaurant, de ses concurrents avec leur note Google, et de son rang dans Google Maps autour de lui">
        <rect width={MAP_SIZE} height={MAP_SIZE} fill="#EEF0EA" />
        {googleFailed ? (
          <g fill="none" stroke="#C9CCC0" strokeDasharray="5 5">
            {[500, 1000].map((m) => (
              <g key={m}>
                <circle cx={MAP_SIZE / 2} cy={MAP_SIZE / 2} r={ringRadius(frame, m)} />
                <text x={MAP_SIZE / 2 + 6} y={MAP_SIZE / 2 - ringRadius(frame, m) + 14} className={s.mapAttr} stroke="none">
                  {m === 1000 ? "1 km" : `${m} m`}
                </text>
              </g>
            ))}
          </g>
        ) : (
          bg === "google" && <image href={src} x={0} y={0} width={MAP_SIZE} height={MAP_SIZE} />
        )}
        {/* Léger voile : le fond reste lisible, les épingles ressortent. */}
        <rect width={MAP_SIZE} height={MAP_SIZE} fill="#fff" opacity={0.18} />

        {/* Votre rang depuis chaque point de la grille */}
        {map.cells.map((c, i) => (
          <g key={i}>
            <circle cx={c.x} cy={c.y} r={CELL_D / 2} fill={CELL_COLOR[c.band].fill} opacity={0.92} stroke="#fff" strokeWidth={2} />
            <text x={c.x} y={c.y + 5} textAnchor="middle" className={s.mapCell} fill={CELL_COLOR[c.band].text}>
              {c.rank == null ? "20+" : ordinal(c.rank)}
            </text>
          </g>
        ))}

        {/* Les concurrents : point exact + étiquette « rang · note » */}
        {map.pins.map((p) => {
          const moved = Math.hypot(p.label.x - p.at.x, p.label.y + PIN_H / 2 - p.at.y) > 8;
          const x = p.label.x - PIN_W / 2;
          const y = p.label.y - PIN_H / 2;
          return (
            <g key={p.rank + p.name}>
              <title>{`${p.name} — ${p.rating != null ? `${fmt1(p.rating)}★` : "sans note"}, ${(p.reviews ?? 0).toLocaleString("fr-BE")} avis`}</title>
              {moved && <line x1={p.at.x} y1={p.at.y} x2={p.label.x} y2={p.label.y} stroke="#0C1509" strokeWidth={1.2} opacity={0.55} />}
              <circle cx={p.at.x} cy={p.at.y} r={4} fill="#0C1509" stroke="#fff" strokeWidth={1.5} />
              <rect x={x} y={y} width={PIN_W} height={PIN_H} rx={PIN_H / 2} fill="#fff" stroke={p.rival ? "#9E6612" : "#0C1509"} strokeWidth={p.rival ? 2.5 : 1.2} strokeDasharray={p.offMap ? "4 3" : undefined} />
              <circle cx={x + PIN_H / 2} cy={p.label.y} r={PIN_H / 2 - 4} fill={p.rival ? "#9E6612" : "#0C1509"} />
              <text x={x + PIN_H / 2} y={p.label.y + 4.5} textAnchor="middle" className={s.mapRank}>
                {p.rank}
              </text>
              <text x={x + PIN_H + 4} y={p.label.y + 5} className={s.mapRating}>
                {p.rating != null ? `${fmt1(p.rating)}★` : "—"}
              </text>
            </g>
          );
        })}

        {/* Vous */}
        <g>
          <rect x={map.self.x - SELF_W / 2} y={map.self.y - SELF_H / 2} width={SELF_W} height={SELF_H} rx={SELF_H / 2} fill="#6B7C3F" stroke="#fff" strokeWidth={2.5} />
          <text x={map.self.x} y={map.self.y + 5} textAnchor="middle" className={s.mapSelf}>
            Vous{map.self.rank != null ? ` · ${ordinal(map.self.rank)}` : ""}
            {map.self.rating != null ? ` · ${fmt1(map.self.rating)}★` : ""}
          </text>
        </g>

      </svg>
      {googleFailed && showSourceError && (
        <span className={s.sum}>Fond de carte Google indisponible (Maps Static API non activée sur la clé GOOGLE_PLACES_API_KEY ?) : cercles de distance affichés à la place.</span>
      )}
    </div>
  );
}
