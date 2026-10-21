"use client";

import { useActionState, useTransition, useState } from "react";
import { eraseTestSet, generateTestSet, type TestSetResult } from "../actions";

const BTN = "rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-semibold text-sm px-4 py-2 disabled:opacity-50";
const BTN_DANGER = "rounded-lg border border-red-300 text-red-700 dark:text-red-300 font-semibold text-sm px-4 py-2 disabled:opacity-50";

export function GenerateForm({ restaurants }: { restaurants: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<TestSetResult | null, FormData>(generateTestSet, null);
  return (
    <form action={action} className="space-y-3">
      <label className="block text-sm font-semibold" htmlFor="restaurantId">
        Établissement de démonstration
      </label>
      <select id="restaurantId" name="restaurantId" required className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent px-2.5 py-2 text-sm">
        {restaurants.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending || restaurants.length === 0} className={BTN}>
        {pending ? "Création…" : "Générer le jeu de test"}
      </button>
      {state?.error && (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {state.error}
        </p>
      )}
      {state?.message && <p className="text-sm font-semibold text-emerald-700">{state.message}</p>}
    </form>
  );
}

export function EraseButton() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<TestSetResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="space-y-2">
      {!confirming ? (
        <button type="button" className={BTN_DANGER} onClick={() => setConfirming(true)}>
          Tout effacer
        </button>
      ) : (
        <div className="space-y-2">
          <p className="text-sm">Efface les prestataires « [TEST] », leurs missions et leurs fichiers. Rien d&apos;autre.</p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              className={BTN_DANGER}
              onClick={() =>
                start(async () => {
                  setResult(await eraseTestSet());
                  setConfirming(false);
                })
              }
            >
              {pending ? "Effacement…" : "Oui, tout effacer"}
            </button>
            <button type="button" disabled={pending} className="text-sm font-semibold px-3" onClick={() => setConfirming(false)}>
              Annuler
            </button>
          </div>
        </div>
      )}
      {result?.error && (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {result.error}
        </p>
      )}
      {result?.message && <p className="text-sm font-semibold text-emerald-700">{result.message}</p>}
    </div>
  );
}
