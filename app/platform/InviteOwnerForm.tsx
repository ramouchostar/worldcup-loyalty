"use client";

import { useState } from "react";
import { FlatSelect } from "@/components/platform/FlatSelect";
import { createOwnerInviteFromForm } from "./actions";
import { ADMIN_ROLE_LABELS, ADMIN_ROLES } from "@/lib/restaurant-admin-roles";

// ADR 0032 + ADR 0041 — génère le lien d'invitation et le donne à partager
// tout de suite (copie / WhatsApp), sans quitter la console. L'email est
// facultatif : renseigné, le lien part aussi par email ; vide, on partage à
// la main. Le rôle est proposé ici, confirmé par l'invité à l'acceptation —
// une invitation ordinaire n'évince jamais personne (elle ajoute un siège ou
// est forcée en équipe si le quota gérant/manager est déjà atteint), donc
// plus de confirmation à demander avant de générer le lien.
export function InviteOwnerForm({
  restaurants,
}: {
  restaurants: { id: string; name: string; hasOwner: boolean; ownerEmail: string | null }[];
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; emailed: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [restaurantId, setRestaurantId] = useState("");
  const [role, setRole] = useState<string>("gerant");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;

    setLoading(true);
    setError(null);
    setResult(null);
    setCopied(false);

    const res = await createOwnerInviteFromForm(null, new FormData(form));
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (res.url) {
      setResult({ url: res.url, emailed: !!res.emailed });
      form.reset();
      setRestaurantId("");
      setRole("gerant");
    }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <FlatSelect
            name="restaurant_id"
            value={restaurantId}
            onChange={setRestaurantId}
            ariaLabel="Établissement"
            placeholder="Établissement…"
            options={restaurants.map((r) => ({
              value: r.id,
              label: r.hasOwner ? `${r.name} (a déjà un gérant)` : r.name,
            }))}
            triggerClassName="h-[38px] w-full inline-flex items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 hover:border-gray-400 transition-colors"
          />
          <FlatSelect
            name="role"
            value={role}
            onChange={setRole}
            ariaLabel="Rôle"
            options={ADMIN_ROLES.map((r) => ({ value: r, label: ADMIN_ROLE_LABELS[r] }))}
            triggerClassName="h-[38px] w-full inline-flex items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 hover:border-gray-400 transition-colors"
          />
        </div>
        <input
          name="owner_email"
          type="email"
          placeholder="Email (facultatif)"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand-red text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-red-700 disabled:opacity-50 transition-colors"
        >
          {loading ? "Génération..." : "Générer le lien d'invitation"}
        </button>
      </form>

      {result && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 space-y-2">
          <p className="text-sm font-semibold text-green-900">
            Lien prêt {result.emailed ? "— et envoyé par email." : "— à envoyer au restaurateur."}
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={result.url}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 border border-green-200 rounded-lg px-3 py-2 text-xs bg-white font-mono"
            />
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(result.url);
                setCopied(true);
              }}
              className="px-3 py-2 bg-white border border-green-200 rounded-lg text-sm font-medium hover:bg-green-100 shrink-0"
            >
              {copied ? "Copié ✓" : "Copier"}
            </button>
          </div>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(
              `Voici ton accès restaurateur Boosteats 👉 ${result.url}`
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center bg-[#25D366] text-white py-2 rounded-lg text-sm font-semibold hover:brightness-95 transition"
          >
            Envoyer par WhatsApp
          </a>
          <p className="text-xs text-green-700">
            Valable 14 jours, utilisable une seule fois. Le restaurateur peut créer son
            compte après avoir cliqué.
          </p>
        </div>
      )}
    </div>
  );
}
