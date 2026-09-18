import { Lock } from "lucide-react";
import { Card } from "./Card";

// Page réservée à un rôle — le bloc que /settings et /thresholds
// recopiaient mot pour mot (ADR 0041 §6 : les trois surfaces financières sont
// réservées aux gérants et managers).
//
// ⚠️ Ceci est un AFFICHAGE, jamais la garde. Chaque page vérifie le rôle
// côté serveur avant de rendre quoi que ce soit (défense en profondeur,
// CVE-2025-29927 — le middleware seul ne suffit pas). Ne jamais rendre le
// contenu protégé « en dessous » de ce bloc.
export function Restricted({
  title = "Accès réservé",
  children = "Réservé aux gérants et managers de cet établissement.",
}: {
  title?: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className="max-w-lg" padding="p-6">
      <span className="w-10 h-10 rounded-xl bg-paper-subtle text-ink-muted flex items-center justify-center mb-3">
        <Lock size={19} strokeWidth={1.7} aria-hidden="true" />
      </span>
      <h1 className="font-display text-[19px] font-bold tracking-[-0.01em] text-ink mb-1">
        {title}
      </h1>
      <p className="text-sm text-ink-muted">{children}</p>
    </Card>
  );
}
