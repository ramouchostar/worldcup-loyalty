"use client";

import { useEffect, useState } from "react";

// Les frictions sont un radar, pas un journal : une fois la série regardée
// (images à l'appui) et comprise, la carte n'a plus rien à dire et encombre le
// haut de la page à chaque visite. D'où la croix : on masque au cas par cas.
//
// Le masquage vit dans localStorage (par navigateur, par super-admin) et non
// en base : rien à migrer, et surtout rien de partagé — ce qu'un associé a
// déjà traité ne doit pas disparaître de l'écran de l'autre. Les cartes
// masquées restent rappelées en pied de section avec « Tout réafficher » : on
// cache du bruit, on ne perd jamais un signal.
const CLE_MASQUEES = "platform:scans:frictions-masquees";
const MAX_MEMOIRE = 500;

export type FrictionCard = {
  id: string;
  memberLabel: string;
  restaurantLabel: string;
  rangeLabel: string;
  attempts: number;
  resolved: boolean;
  hints: string[];
};

function lire(): string[] {
  try {
    const raw = localStorage.getItem(CLE_MASQUEES);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    // localStorage indisponible (navigation privée) → rien de masqué, jamais d'erreur.
    return [];
  }
}

function ecrire(ids: string[]) {
  try {
    localStorage.setItem(CLE_MASQUEES, JSON.stringify(ids.slice(-MAX_MEMOIRE)));
  } catch {
    // idem — le masquage vaut alors pour la session affichée, sans plus.
  }
}

export function ScanFrictions({
  frictions,
  minScans,
  windowMin,
}: {
  frictions: FrictionCard[];
  minScans: number;
  windowMin: number;
}) {
  // `null` = pas encore hydraté. On ne rend rien avant d'avoir lu localStorage,
  // sinon le serveur affiche des cartes que le client masque aussitôt (mismatch
  // React + clignotement).
  const [masquees, setMasquees] = useState<string[] | null>(null);

  useEffect(() => {
    setMasquees(lire());
  }, []);

  if (masquees === null || frictions.length === 0) return null;

  const cachees = new Set(masquees);
  const visibles = frictions.filter((f) => !cachees.has(f.id));
  const nbMasquees = frictions.length - visibles.length;

  const masquer = (id: string) => {
    setMasquees((prev) => {
      const next = [...(prev ?? []), id];
      ecrire(next);
      return next;
    });
  };

  const toutReafficher = () => {
    // On ne vide que ce qui concerne les frictions affichées ici : un filtre
    // établissement ne doit pas ressusciter les cartes masquées ailleurs.
    setMasquees((prev) => {
      const ids = new Set(frictions.map((f) => f.id));
      const next = (prev ?? []).filter((id) => !ids.has(id));
      ecrire(next);
      return next;
    });
  };

  return (
    <section className="mb-6">
      {visibles.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-red-900 mb-1">
            ⚠️ {visibles.length} friction{visibles.length > 1 ? "s" : ""} détectée{visibles.length > 1 ? "s" : ""}
          </h2>
          <p className="text-xs text-gray-500 mb-3">
            Un membre a enchaîné ≥ {minScans} scans sans soumission en moins de {windowMin} min. Les
            indices sont des heuristiques — les images (colonne « Ticket ») disent le reste. La croix
            masque une carte déjà traitée.
          </p>
        </>
      )}

      <div className="space-y-2">
        {visibles.map((f) => (
          <div
            key={f.id}
            className={`rounded-lg border px-3 py-2 text-sm ${f.resolved ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200"}`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-semibold text-gray-900">
                <button
                  type="button"
                  onClick={() => masquer(f.id)}
                  aria-label={`Masquer la friction de ${f.memberLabel}`}
                  title="Masquer cette friction"
                  className="mr-1.5 -ml-1 inline-flex h-5 w-5 items-center justify-center rounded text-base font-normal leading-none text-gray-400 hover:bg-white/70 hover:text-gray-700 transition-colors"
                >
                  ×
                </button>
                {f.memberLabel}
                <span className="font-normal text-gray-500"> · {f.restaurantLabel}</span>
              </span>
              <span className="text-xs text-gray-600">
                {f.attempts} essai{f.attempts > 1 ? "s" : ""} · {f.rangeLabel} ·{" "}
                {f.resolved ? "a fini par passer" : "JAMAIS soumis"}
              </span>
            </div>
            <ul className="mt-1 text-xs text-gray-700 list-disc list-inside">
              {f.hints.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {nbMasquees > 0 && (
        <p className="mt-2 text-xs text-gray-500">
          {nbMasquees} friction{nbMasquees > 1 ? "s" : ""} masquée{nbMasquees > 1 ? "s" : ""}
          {visibles.length === 0 ? " — plus rien à regarder ici." : "."}{" "}
          <button
            type="button"
            onClick={toutReafficher}
            className="underline underline-offset-2 hover:text-gray-800"
          >
            Tout réafficher
          </button>
        </p>
      )}
    </section>
  );
}
