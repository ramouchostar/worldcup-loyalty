import type { ReactNode } from "react";

// Cadre d'iPhone partagé par le héros et la visite guidée : coque, îlot,
// barre d'état. L'écran a une hauteur fixe (passée par `screenClassName`) ;
// ce qui dépasse est coupé, comme une vraie app qu'on n'a pas fait défiler.
export function PhoneFrame({
  children,
  className = "w-[280px] sm:w-[310px]",
  screenClassName,
  statusTone = "dark",
}: {
  children: ReactNode;
  className?: string;
  screenClassName?: string;
  /** Couleur de la barre d'état : sombre sur fond clair, claire sur fond sombre. */
  statusTone?: "dark" | "light";
}) {
  const tone = statusTone === "dark" ? "text-ink" : "text-white";
  const fill = statusTone === "dark" ? "bg-ink/80" : "bg-white/85";
  const border = statusTone === "dark" ? "border-ink/70" : "border-white/80";
  return (
    <div className={`${className} rounded-[46px] bg-ink p-[10px] shadow-[0_30px_80px_rgba(10,10,10,0.35)]`}>
      <div className={`relative bg-paper rounded-[37px] overflow-hidden font-landing ${screenClassName ?? ""}`}>
        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-6 pt-3 pointer-events-none">
          <span className={`text-[12px] font-semibold ${tone}`}>9:41</span>
          <span className="absolute left-1/2 -translate-x-1/2 top-2.5 w-[86px] h-[24px] rounded-full bg-ink" />
          <span className="flex items-center gap-1" aria-hidden>
            <span className={`w-[14px] h-[8px] rounded-[2px] ${fill}`} />
            <span className={`w-[20px] h-[9px] rounded-[3px] border ${border} p-[1px]`}>
              <span className={`block h-full w-3/4 rounded-[1px] ${fill}`} />
            </span>
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}
