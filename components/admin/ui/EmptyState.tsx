import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

// État vide de la console — une icône lucide dans une pastille teintée, le
// même geste que la carte « Tout est à jour » du dashboard.
//
// Volontairement PAS d'illustration Fluent Emoji 3D, contrairement à l'app
// membre (design system, registre 2) : la console a son propre registre
// depuis m54 — icônes fines, pas d'emoji, « rendu console pro plutôt que
// grand public ». Un 🌱 en `text-3xl` n'y est pas à sa place.
//
// Un état vide dit toujours DEUX choses : ce qu'il n'y a pas, et pourquoi
// c'est normal (ou ce qu'il faut faire). Sans la deuxième, le restaurateur
// croit à une panne.

const TONES = {
  neutral: "bg-paper-subtle text-ink-muted",
  good: "bg-good/10 text-good",
} as const;

export function EmptyState({
  icon: Icon,
  title,
  children,
  tone = "neutral",
  action,
  bordered = true,
}: {
  icon: LucideIcon;
  title: ReactNode;
  /** Pourquoi c'est vide, ou le prochain geste. */
  children?: ReactNode;
  tone?: keyof typeof TONES;
  action?: ReactNode;
  /** `false` quand le bloc est déjà posé dans une `Card`. */
  bordered?: boolean;
}) {
  return (
    <div
      className={`px-5 py-8 text-center ${
        bordered ? "bg-white border border-dashed border-paper-border rounded-xl" : ""
      }`}
    >
      <span
        className={`w-11 h-11 rounded-xl ${TONES[tone]} flex items-center justify-center mx-auto mb-3`}
      >
        <Icon size={21} strokeWidth={1.7} aria-hidden="true" />
      </span>
      <p className="text-[14.5px] font-semibold text-ink">{title}</p>
      {children && (
        <p className="text-[12.5px] text-ink-muted mt-1.5 max-w-md mx-auto">{children}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
