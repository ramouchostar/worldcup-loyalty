"use client";

import { useState } from "react";
import { createSeatInviteFromConsole, revokeSeatInviteFromConsole } from "./actions";
import { ADMIN_ROLES, ADMIN_ROLE_LABELS, type AdminRole } from "@/lib/restaurant-admin-roles";

type Invite = { url: string; role: AdminRole; emailed?: boolean };

// ADR 0041 — même geste que InviteOwnerForm.tsx (/platform), mais l'établissement
// est fixé par l'URL (pas de sélecteur) : c'est un gérant/manager qui invite
// pour SON établissement, pas le super-admin pour n'importe lequel.
export function SeatInviteForm({
  restaurantId,
  initialInvite,
}: {
  restaurantId: string;
  initialInvite: Invite | null;
}) {
  const [invite, setInvite] = useState<Invite | null>(initialInvite);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setLoading(true);
    setError(null);
    setCopied(false);

    const res = await createSeatInviteFromConsole(restaurantId, null, new FormData(form));
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (res.url) {
      const role = (form.elements.namedItem("role") as HTMLSelectElement).value as AdminRole;
      setInvite({ url: res.url, role, emailed: res.emailed });
      // Le rôle choisi reste affiché tel quel (pas de form.reset()) : régénérer
      // avec le même rôle reste possible sans le resélectionner. Seul l'email,
      // à usage unique, est vidé.
      (form.elements.namedItem("email") as HTMLInputElement).value = "";
    }
  }

  async function handleRevoke() {
    setLoading(true);
    await revokeSeatInviteFromConsole(restaurantId);
    setLoading(false);
    setInvite(null);
  }

  return (
    <div className="space-y-3">
      {invite && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 space-y-2">
          <p className="text-sm text-green-900">
            Lien {invite.emailed ? "envoyé par email" : "prêt à partager"} — rôle proposé :{" "}
            <span className="font-semibold">{ADMIN_ROLE_LABELS[invite.role]}</span>.
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={invite.url}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 border border-green-200 rounded-lg px-3 py-2 text-xs bg-white font-mono"
            />
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(invite.url);
                setCopied(true);
              }}
              className="px-3 py-2 bg-white border border-green-200 rounded-lg text-sm font-medium hover:bg-green-100 shrink-0"
            >
              {copied ? "Copié ✓" : "Copier"}
            </button>
          </div>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`Voici ton accès console Boosteats 👉 ${invite.url}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center bg-[#25D366] text-white py-2 rounded-lg text-sm font-semibold hover:brightness-95 transition"
          >
            Envoyer par WhatsApp
          </a>
          <button
            type="button"
            disabled={loading}
            onClick={handleRevoke}
            className="w-full text-xs text-red-700 hover:underline disabled:opacity-50"
          >
            Révoquer ce lien
          </button>
        </div>
      )}

      {/* Le rôle reste modifiable même un lien déjà actif : générer en
          choisit un autre le remplace (createOwnerInvite révoque toujours le
          précédent en premier), pas besoin de révoquer à la main d'abord. */}
      <form onSubmit={handleSubmit} className="space-y-3">
        {invite && (
          <p className="text-xs text-gray-400">
            Choisis un rôle différent puis régénère pour remplacer le lien ci-dessus.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <select
            name="role"
            defaultValue={initialInvite?.role ?? "gerant"}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
          >
            {ADMIN_ROLES.map((role) => (
              <option key={role} value={role}>
                {ADMIN_ROLE_LABELS[role]}
              </option>
            ))}
          </select>
          <input name="email" type="email" placeholder="Email (facultatif)" className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand-red text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-red-700 disabled:opacity-50 transition-colors"
        >
          {loading ? "Génération..." : invite ? "Générer un nouveau lien" : "Générer le lien d'invitation"}
        </button>
      </form>
    </div>
  );
}
