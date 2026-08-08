import type { ReactNode } from "react";
import { ScaledFrame } from "./ScaledFrame";

// Fenêtre de navigateur factice qui encadre les mockups produit — chrome
// (pastilles + barre d'url) fixe, contenu mis à l'échelle via ScaledFrame.
export function BrowserWindow({
  url,
  scaleWidth,
  children,
  chromeHeight = 32,
}: {
  url: string;
  scaleWidth: number;
  children: ReactNode;
  chromeHeight?: 32 | 34;
}) {
  return (
    <div className="rounded-xl bg-night-raised border border-night-line shadow-[0_12px_32px_rgba(10,10,10,0.12)] overflow-hidden">
      <div
        className="bg-night-chrome border-b border-night-line flex items-center px-3 gap-[7px]"
        style={{ height: chromeHeight }}
      >
        <Dot />
        <Dot />
        <Dot />
        <span className="font-mono text-night-faint ml-3" style={{ fontSize: chromeHeight >= 34 ? 10 : 9.5 }}>
          {url}
        </span>
      </div>
      <div className="bg-paper">
        <ScaledFrame width={scaleWidth}>{children}</ScaledFrame>
      </div>
    </div>
  );
}

function Dot() {
  return <span className="w-[9px] h-[9px] rounded-full bg-night-line block" />;
}
