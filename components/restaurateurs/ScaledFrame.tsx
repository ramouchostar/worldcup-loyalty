"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Rejoue à l'identique le mécanisme `data-scale-w` du design Claude : le
// contenu des mockups (dashboard, app membre) est mis en page à une largeur
// fixe (design desktop), puis réduit à l'échelle du conteneur réel — ce qui
// garde le mockup lisible en pixel-perfect à toute taille d'écran, du mobile
// au desktop, sans jamais le recomposer.
export function ScaledFrame({
  width,
  children,
  className,
}: {
  width: number;
  children: ReactNode;
  className?: string;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const fit = () => {
      const containerWidth = outer.clientWidth;
      if (!containerWidth) return;
      const nextScale = containerWidth / width;
      setScale(nextScale);
      setHeight(inner.scrollHeight * nextScale);
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(outer);
    return () => ro.disconnect();
  }, [width]);

  return (
    <div
      ref={outerRef}
      className={className}
      // minWidth: 0 défensif — un parent flex/grid ne mesurerait sinon jamais
      // en dessous de la largeur intrinsèque du contenu enfant (width fixe
      // ci-dessous), ce qui a déjà empêché ce conteneur de rétrécir sur
      // mobile dans une grille (bug constaté sur ProductSection, 2026-08-08).
      style={{ height: height || undefined, overflow: "hidden", minWidth: 0 }}
    >
      <div
        ref={innerRef}
        style={{
          width,
          transform: `scale(${scale || 1})`,
          transformOrigin: "top left",
          opacity: scale ? 1 : 0,
          transition: "opacity 300ms ease",
        }}
      >
        {children}
      </div>
    </div>
  );
}
