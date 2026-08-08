import type { LucideIcon } from "lucide-react";

// Pastille d'icône plate, couleur unique — pas d'emoji, pas de dégradé.
// Utilisée par la landing publique clients (session branding du 2026-07-28).
// La landing restaurateurs a sa propre identité visuelle depuis le redesign
// m55 (components/restaurateurs/) et n'en dépend plus.
export function IconTile({
  icon: Icon,
  size = "md",
  tone = "accent",
}: {
  icon: LucideIcon;
  size?: "sm" | "md";
  tone?: "accent" | "onDark";
}) {
  const dims = size === "sm" ? "w-9 h-9" : "w-11 h-11";
  const iconDims = size === "sm" ? "w-4 h-4" : "w-5 h-5";
  const colors = tone === "onDark" ? "bg-white/15 text-white" : "bg-brand-red/10 text-brand-red";
  return (
    <div className={`${dims} ${colors} rounded-xl flex items-center justify-center shrink-0`}>
      <Icon className={iconDims} strokeWidth={2} />
    </div>
  );
}
