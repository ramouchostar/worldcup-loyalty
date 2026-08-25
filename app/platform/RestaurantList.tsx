"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import {
  setRestaurantStatus,
  setRestaurantPlanFromForm,
  setRestaurantDemo,
  createOwnerInviteForRestaurant,
  revokeOwnerInviteAction,
} from "./actions";

export type RestaurantViewRow = {
  id: string;
  name: string;
  sector: string | null;
  status: "pending" | "active" | "disabled";
  // ADR 0033 §1 — établissement fictif de démonstration.
  isDemo: boolean;
  memberCount: number;
  ownerEmail: string | null;
  hasOwner: boolean;
  plan: string;
  // ADR 0032 — lien d'invitation restaurateur encore en circulation, s'il y en a un.
  invite: { id: string; url: string; expiresAt: string } | null;
};

const STATUS_BADGE: Record<RestaurantViewRow["status"], { label: string; cls: string }> = {
  active:   { label: "Actif",      cls: "bg-green-100 text-green-800" },
  pending:  { label: "En attente", cls: "bg-amber-100 text-amber-800" },
  disabled: { label: "Désactivé",  cls: "bg-gray-100 text-gray-500" },
};

// ADR 0029 — plan courant du resto, lu côté serveur : c'est la seule source de
// vérité affichée. Le <select> du flip, lui, n'est qu'une saisie.
const PLAN_BADGE: Record<string, { label: string; cls: string }> = {
  gratuit:    { label: "Gratuit",    cls: "bg-gray-100 text-gray-500" },
  croissance: { label: "Croissance", cls: "bg-blue-100 text-blue-800" },
  pro:        { label: "Pro",        cls: "bg-amber-100 text-amber-800" },
};

function PlanSubmitButton({ dirty }: { dirty: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || !dirty}
      className="text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-1.5 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {pending ? "…" : "OK"}
    </button>
  );
}

// Flip de plan manuel. Le <select> est CONTRÔLÉ à dessein : React 19
// réinitialise les champs non contrôlés d'un <form action={…}> dès que
// l'action se termine — un select en defaultValue retombait donc visuellement
// sur « Gratuit » juste après l'enregistrement, en faisant croire à un échec
// alors que la bascule était bien écrite en base.
function PlanFlipForm({ restaurantId, plan }: { restaurantId: string; plan: string }) {
  const [value, setValue] = useState(plan);
  // Le plan serveur redevient maître à chaque revalidation (motif React
  // « ajuster l'état quand une prop change », sans effet).
  const [serverPlan, setServerPlan] = useState(plan);
  if (serverPlan !== plan) {
    setServerPlan(plan);
    setValue(plan);
  }

  return (
    <form action={setRestaurantPlanFromForm} className="flex items-center gap-1">
      <input type="hidden" name="restaurantId" value={restaurantId} />
      <select
        name="plan"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Plan de l'établissement"
        className="text-xs border border-gray-200 rounded-lg px-1.5 py-1.5 bg-white"
      >
        <option value="gratuit">Gratuit</option>
        <option value="croissance">Croissance</option>
        <option value="pro">Pro</option>
      </select>
      <PlanSubmitButton dirty={value !== plan} />
    </form>
  );
}

// ADR 0032 — le lien d'invitation en circulation, affiché là où on décide : sur la
// ligne de l'établissement. Réaffiché tel quel (jamais régénéré à l'affichage)
// pour que le lien déjà parti en WhatsApp reste celui qui marche.
function OwnerInviteRow({ row }: { row: RestaurantViewRow }) {
  const [copied, setCopied] = useState(false);

  if (!row.invite) {
    return (
      <form action={createOwnerInviteForRestaurant.bind(null, row.id)}>
        {row.hasOwner ? (
          <ConfirmSubmitButton
            confirmMessage={`« ${row.name} » a déjà un restaurateur rattaché. Le nouveau lien le remplacera à son acceptation. Continuer ?`}
            className="text-xs font-semibold text-gray-700 bg-gray-100 px-3 py-1.5 rounded-lg hover:bg-gray-200 transition-colors"
          >
            🔗 Nouveau lien d&apos;invitation
          </ConfirmSubmitButton>
        ) : (
          <button
            type="submit"
            className="text-xs font-semibold text-brand-red bg-red-50 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors"
          >
            🔗 Inviter le restaurateur
          </button>
        )}
      </form>
    );
  }

  const expires = new Date(row.invite.expiresAt).toLocaleDateString("fr-BE", {
    day: "numeric",
    month: "short",
  });

  return (
    <div className="w-full mt-2 bg-gray-50 border border-gray-200 rounded-lg p-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={row.invite.url}
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white font-mono"
        />
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(row.invite!.url);
            setCopied(true);
          }}
          className="px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-semibold hover:bg-gray-100 shrink-0"
        >
          {copied ? "Copié ✓" : "Copier"}
        </button>
      </div>
      <div className="flex items-center gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(
            `Voici ton accès restaurateur Boosteats 👉 ${row.invite.url}`
          )}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-[#128C7E] hover:underline"
        >
          WhatsApp ↗
        </a>
        <span className="text-xs text-gray-400">invitation en cours · jusqu&apos;au {expires}</span>
        <form action={revokeOwnerInviteAction.bind(null, row.invite.id)} className="ml-auto">
          <ConfirmSubmitButton
            confirmMessage={`Révoquer le lien d'invitation de « ${row.name} » ? Il ne fonctionnera plus.`}
            className="text-xs font-semibold text-red-700 hover:underline"
          >
            Révoquer
          </ConfirmSubmitButton>
        </form>
      </div>
    </div>
  );
}

const SCOPES = [
  { key: "reels", label: "Réels" },
  { key: "demo", label: "Démo" },
  { key: "tous", label: "Tous" },
] as const;
type Scope = (typeof SCOPES)[number]["key"];

// Recherche client-side — le réseau reste petit (dizaines d'établissements),
// pas besoin d'un round-trip serveur pour filtrer.
export function RestaurantList({ restaurants }: { restaurants: RestaurantViewRow[] }) {
  const [query, setQuery] = useState("");
  // ADR 0033 §1 — par défaut on regarde le réseau RÉEL : les comptes de
  // démonstration s'accumulent et noieraient la liste des vrais dossiers.
  const [scope, setScope] = useState<Scope>("reels");

  const demoCount = restaurants.filter((r) => r.isDemo).length;
  const inScope =
    scope === "tous" ? restaurants : restaurants.filter((r) => (scope === "demo" ? r.isDemo : !r.isDemo));

  const q = query.trim().toLowerCase();
  const filtered = q
    ? inScope.filter((r) =>
        r.name.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        (r.sector ?? "").toLowerCase().includes(q) ||
        (r.ownerEmail ?? "").toLowerCase().includes(q)
      )
    : inScope;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <h2 className="font-bold text-gray-900 mb-4">Tous les établissements ({inScope.length})</h2>

      <div className="flex gap-1 mb-3" role="group" aria-label="Périmètre">
        {SCOPES.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setScope(s.key)}
            aria-pressed={scope === s.key}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
              scope === s.key ? "bg-brand-dark text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {s.label}
            {s.key === "demo" && demoCount > 0 && <span className="ml-1 opacity-70">{demoCount}</span>}
          </button>
        ))}
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Rechercher un établissement (nom, secteur, email owner, id)…"
        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-brand-red/30"
      />

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">
          {inScope.length === 0
            ? scope === "demo"
              ? "Aucun compte démo. Coche « Compte démo » à la création pour en ajouter un."
              : "Aucun établissement."
            : "Aucun établissement ne correspond à cette recherche."}
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const badge = STATUS_BADGE[r.status];
            const planBadge = PLAN_BADGE[r.plan] ?? PLAN_BADGE.gratuit;
            return (
              <div key={r.id} className="border border-gray-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">
                      {r.name}
                      {r.sector && <span className="ml-2 text-xs font-normal text-gray-400">📍 {r.sector}</span>}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      <span className="font-mono">{r.id}</span>
                      {" · "}
                      {r.memberCount} membre{r.memberCount > 1 ? "s" : ""}
                      {" · "}
                      {r.ownerEmail ?? (r.hasOwner ? "owner sans email" : "aucun owner")}
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5">
                    {r.isDemo && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-900 text-white">
                        Démo
                      </span>
                    )}
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${planBadge.cls}`}>
                      {planBadge.label}
                    </span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <Link
                    href={`/admin/${r.id}`}
                    className="text-xs font-semibold text-white bg-brand-dark px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors"
                  >
                    Console admin →
                  </Link>
                  <Link
                    href={`/r/${r.id}`}
                    target="_blank"
                    className="text-xs font-semibold text-gray-700 bg-gray-100 px-3 py-1.5 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Page publique ↗
                  </Link>
                  {/* ADR 0029 — flip de plan manuel (Stripe en Phase 5) */}
                  <PlanFlipForm restaurantId={r.id} plan={r.plan} />
                  {/* ADR 0033 §1 — bascule démo ↔ réel, confirmée dans les DEUX
                      sens : rendre public (risque d'exposer un resto de test)
                      ET masquer (risque de faire disparaître un établissement
                      réel — et avec lui les chiffres réseau — d'un simple clic). */}
                  <form action={setRestaurantDemo.bind(null, r.id, !r.isDemo)}>
                    {r.isDemo ? (
                      <ConfirmSubmitButton
                        confirmMessage={`Passer « ${r.name} » en établissement réel ? Il deviendra visible du public et comptera dans les chiffres réseau.`}
                        className="text-xs font-semibold text-gray-700 bg-gray-100 px-3 py-1.5 rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        Passer en réel
                      </ConfirmSubmitButton>
                    ) : (
                      <ConfirmSubmitButton
                        confirmMessage={`Marquer « ${r.name} » comme compte démo ? Il disparaîtra de l'accueil, de /secteurs, de /join et des chiffres réseau (/platform/stats) jusqu'à ce qu'il repasse en réel.`}
                        className="text-xs font-semibold text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        Marquer démo
                      </ConfirmSubmitButton>
                    )}
                  </form>
                  {/* ADR 0032 — bouton de génération quand aucun lien ne
                      circule ; sinon le lien s'affiche en pleine largeur
                      sous la barre d'actions (bloc ci-dessous). */}
                  {!r.invite && <OwnerInviteRow row={r} />}
                  {r.status === "active" ? (
                    <form action={setRestaurantStatus.bind(null, r.id, "disabled")} className="ml-auto">
                      <ConfirmSubmitButton
                        confirmMessage={`Désactiver « ${r.name} » ? Il deviendra invisible pour tous ses membres.`}
                        className="text-xs font-semibold text-red-700 bg-red-50 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors"
                      >
                        Désactiver
                      </ConfirmSubmitButton>
                    </form>
                  ) : r.status === "disabled" ? (
                    <form action={setRestaurantStatus.bind(null, r.id, "active")} className="ml-auto">
                      <button
                        type="submit"
                        className="text-xs font-semibold text-green-700 bg-green-50 px-3 py-1.5 rounded-lg hover:bg-green-100 transition-colors"
                      >
                        Réactiver
                      </button>
                    </form>
                  ) : null}
                </div>
                {r.invite && <OwnerInviteRow row={r} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
