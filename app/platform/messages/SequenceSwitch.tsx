"use client";

import { useState, useTransition } from "react";
import { toggleSequence } from "./actions";

// Interrupteur séquence × établissement (ADR 0063 §2). Optimiste : l'état
// bascule tout de suite et revient si le serveur refuse, message à l'appui.
export function SequenceSwitch({
  messageKey,
  restaurantId,
  restaurantName,
  sequenceLabel,
  enabled,
  disabled,
}: {
  messageKey: string;
  restaurantId: string;
  restaurantName: string;
  sequenceLabel: string;
  enabled: boolean;
  disabled?: boolean;
}) {
  const [on, setOn] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function flip() {
    const next = !on;
    setOn(next);
    setError(null);
    startTransition(async () => {
      const res = await toggleSequence(messageKey, restaurantId, next);
      if (!res.ok) {
        setOn(!next);
        setError(res.error ?? "Refusé.");
      }
    });
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`${sequenceLabel} — ${restaurantName} : ${on ? "allumée" : "éteinte"}`}
        disabled={disabled || pending}
        onClick={flip}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-900 disabled:opacity-40 ${
          on ? "bg-green-600" : "bg-gray-300"
        }`}
      >
        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
      {error && <span className="text-[11px] text-amber-700 max-w-[10rem] leading-tight">{error}</span>}
    </span>
  );
}
