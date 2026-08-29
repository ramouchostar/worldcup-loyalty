"use client";

import { useState } from "react";
import { FlatSelect } from "@/components/platform/FlatSelect";
import { assignOwner } from "./actions";

// ADR 0041 — ajoute un siège gérant par l'email d'un compte membre déjà
// existant (soumis au même plafond de 2 gérants que le lien d'invitation).
export function AssignOwnerForm({ restaurants }: { restaurants: { id: string; name: string }[] }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [restaurantId, setRestaurantId] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setLoading(true);
    setMessage(null);

    const result = await assignOwner(null, new FormData(form));
    setLoading(false);
    if (result.error) setMessage({ kind: "error", text: result.error });
    if (result.success) {
      setMessage({ kind: "success", text: result.success });
      form.reset();
      setRestaurantId("");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <FlatSelect
          name="restaurant_id"
          value={restaurantId}
          onChange={setRestaurantId}
          ariaLabel="Établissement"
          placeholder="Établissement…"
          options={restaurants.map((r) => ({ value: r.id, label: r.name }))}
          triggerClassName="h-[38px] w-full inline-flex items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 hover:border-gray-400 transition-colors"
        />
        <input
          name="owner_email"
          type="email"
          required
          placeholder="Email du restaurateur"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      {message && (
        <p className={`text-sm ${message.kind === "error" ? "text-red-600" : "text-green-700"}`}>
          {message.text}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-brand-dark text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-gray-800 disabled:opacity-50 transition-colors"
      >
        {loading ? "Ajout..." : "Ajouter un gérant"}
      </button>
    </form>
  );
}
