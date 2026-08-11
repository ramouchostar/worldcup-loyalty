"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

/**
 * Bouton de soumission pour les <form action={serverAction}> (audit UX
 * 2026-08-11) : feedback immédiat au tap + anti-double-soumission via
 * useFormStatus. À utiliser à l'intérieur du <form> concerné.
 */
export function PendingButton({
  children,
  pendingLabel = "Un instant…",
  className = "",
}: {
  children: ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${className} disabled:opacity-60`}>
      {pending ? pendingLabel : children}
    </button>
  );
}
