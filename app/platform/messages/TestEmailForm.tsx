"use client";

import { useState, useTransition } from "react";
import { sendTestEmailAction } from "./actions";

// « M'envoyer un e-mail de test » : le moyen le plus court de savoir si la
// configuration d'envoi marche vraiment — et de voir un gabarit dans sa
// propre boîte, sur son propre téléphone.
export function TestEmailForm({ options, to }: { options: { id: string; label: string }[]; to: string | null }) {
  const [entryId, setEntryId] = useState(options[0]?.id ?? "");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col sm:flex-row sm:items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setResult(null);
        startTransition(async () => setResult(await sendTestEmailAction(entryId)));
      }}
    >
      <label htmlFor="test-email-template" className="sr-only">Gabarit à envoyer</label>
      <select
        id="test-email-template"
        value={entryId}
        onChange={(e) => setEntryId(e.target.value)}
        className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 min-w-0 sm:max-w-xs"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending || !entryId}
        className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {pending ? "Envoi…" : "M'envoyer ce test"}
      </button>
      {!result && to && <p className="text-xs text-gray-500">Vers {to}</p>}
      {result && (
        <p role="status" className={`text-sm ${result.ok ? "text-green-700" : "text-amber-700"}`}>{result.message}</p>
      )}
    </form>
  );
}
