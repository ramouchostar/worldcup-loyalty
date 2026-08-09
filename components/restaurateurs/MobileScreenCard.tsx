import type { ReactNode } from "react";

// Équivalent mobile de BrowserWindow — même idée (petit libellé d'URL en
// en-tête) mais sans les pastilles de fenêtre desktop (aucun sens sur un
// écran de téléphone) et sans mise à l'échelle : le contenu est composé
// directement à des proportions mobiles, pas une capture desktop réduite.
export function MobileScreenCard({ url, children }: { url: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-paper-border bg-white shadow-[0_8px_24px_rgba(10,10,10,0.08)] overflow-hidden">
      <div className="h-8 bg-paper-subtle border-b border-paper-border flex items-center px-3">
        <span className="font-mono text-[10px] text-ink-faint truncate">{url}</span>
      </div>
      <div className="bg-paper p-4">{children}</div>
    </div>
  );
}
