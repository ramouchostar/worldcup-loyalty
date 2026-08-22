"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { readJsonSafe, describeHttpFailure } from "@/lib/fetch-json";

// Événements locaux du restaurateur (ADR 0027 §6) : il connaît son terrain
// mieux que la plateforme. Chaque événement pousse/baisse le forecast sur sa
// période. Édition = ancrage dans l'outil.

export type EventItem = {
  id: string;
  label: string;
  starts_on: string;
  ends_on: string;
  expected_effect: "up" | "down";
};

export default function LocalEventManager({
  restaurantId,
  events,
}: {
  restaurantId: string;
  events: EventItem[];
}) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [effect, setEffect] = useState<"up" | "down">("up");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function add() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/restaurant-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantId,
          label,
          starts_on: startsOn,
          ends_on: endsOn || startsOn,
          expected_effect: effect,
        }),
      });
      const { data } = await readJsonSafe<{ error?: string }>(res);
      if (!res.ok) {
        setError(describeHttpFailure(res.status, data?.error));
        return;
      }
      setLabel("");
      setStartsOn("");
      setEndsOn("");
      setEffect("up");
      router.refresh();
    } catch {
      setError("Erreur réseau.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/admin/restaurant-events?restaurantId=${encodeURIComponent(restaurantId)}&id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <h2 className="font-bold text-gray-900">Mes événements locaux</h2>
      <p className="text-xs text-gray-500 mt-1">
        Braderie de quartier, concert voisin, fermeture… Ajoute-les pour affiner tes prévisions ces jours-là.
      </p>

      {events.length > 0 && (
        <ul className="mt-4 space-y-2">
          {events.map((ev) => (
            <li key={ev.id} className="flex items-center justify-between gap-3 bg-gray-50 rounded-lg px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{ev.label}</p>
                <p className="text-xs text-gray-500">
                  {fr(ev.starts_on)}
                  {ev.ends_on !== ev.starts_on ? ` → ${fr(ev.ends_on)}` : ""} ·{" "}
                  <span className={ev.expected_effect === "up" ? "text-green-700" : "text-red-700"}>
                    {ev.expected_effect === "up" ? "hausse attendue" : "baisse attendue"}
                  </span>
                </p>
              </div>
              <button
                onClick={() => remove(ev.id)}
                disabled={busy}
                className="text-xs text-gray-400 hover:text-red-600 shrink-0"
                aria-label="Supprimer"
              >
                Supprimer
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid sm:grid-cols-2 gap-3">
        <label className="block sm:col-span-2">
          <span className="text-xs font-medium text-gray-600">Nom de l&apos;événement</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={120}
            placeholder="ex. Braderie du quartier"
            className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-600">Du</span>
          <input
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
            className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-600">Au (optionnel)</span>
          <input
            type="date"
            value={endsOn}
            onChange={(e) => setEndsOn(e.target.value)}
            className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-xs font-medium text-gray-600">Effet attendu sur les ventes</span>
          <select
            value={effect}
            onChange={(e) => setEffect(e.target.value === "down" ? "down" : "up")}
            className="mt-1 w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
          >
            <option value="up">Hausse (plus de monde)</option>
            <option value="down">Baisse (moins de monde)</option>
          </select>
        </label>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <button
        onClick={add}
        disabled={busy || !label.trim() || !startsOn}
        className="mt-3 bg-brand-dark text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-black/80 transition-colors"
      >
        {busy ? "…" : "Ajouter l'événement"}
      </button>
    </div>
  );
}

function fr(ymd: string): string {
  return `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;
}
