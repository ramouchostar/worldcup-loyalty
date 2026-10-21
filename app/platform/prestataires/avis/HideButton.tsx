"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toggleReviewHiddenAction } from "../actions";

export function HideButton({ reviewId, hidden }: { reviewId: string; hidden: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(false);
          const r = await toggleReviewHiddenAction(reviewId, !hidden);
          setBusy(false);
          if (r.ok) router.refresh();
          else setError(true);
        }}
        className="rounded-lg border border-gray-300 dark:border-gray-700 px-2.5 py-1 text-xs font-semibold disabled:opacity-60"
      >
        {hidden ? "Rétablir" : "Masquer"}
      </button>
      {error && <span role="alert" className="text-xs text-red-600">Impossible pour le moment.</span>}
    </span>
  );
}
