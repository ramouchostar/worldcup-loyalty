"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { RestaurantMatchRate } from "@/lib/match-rates";

// ADR 0046 — le rattachement catalogue est un VERROU, pas un tableau de bord :
// ce qu'on vient y chercher, c'est « qui est sous le seuil ». Une ligne par
// établissement (le réseau en compte des dizaines, tous à 100 % le jour où
// tout va bien) poussait les frictions et la table des scans hors de l'écran.
//
// D'où une seule fenêtre repliable : l'en-tête porte le verdict, les
// établissements en alerte restent visibles même repliée (on cache du bruit,
// jamais un signal — même règle que la croix des frictions), et le détail
// complet se déplie dans une zone qui défile toute seule.
//
// L'état ouvert/replié vit dans localStorage (par navigateur, par super-admin)
// comme le masquage des frictions : rien en base, rien de partagé.
const CLE_OUVERT = "platform:scans:rattachement-ouvert";

function lireOuvert(): boolean {
  try {
    return localStorage.getItem(CLE_OUVERT) === "1";
  } catch {
    // localStorage indisponible (navigation privée) → replié, jamais d'erreur.
    return false;
  }
}

function ecrireOuvert(ouvert: boolean) {
  try {
    localStorage.setItem(CLE_OUVERT, ouvert ? "1" : "0");
  } catch {
    // idem — la préférence vaut alors pour la session affichée, sans plus.
  }
}

function Ligne({ r, alert }: { r: RestaurantMatchRate; alert: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border px-3 py-1.5 text-sm ${
        alert ? "bg-red-50 border-red-200" : "bg-white border-gray-100"
      }`}
    >
      <span className="flex-1 truncate font-medium text-gray-800">{r.name}</span>
      <span className="shrink-0 text-xs text-gray-400">
        {r.matched}/{r.total} lignes
        {r.ignored > 0 ? ` · ${r.ignored} ignorée${r.ignored > 1 ? "s" : ""}` : ""}
      </span>
      <span className={`shrink-0 font-bold tabular-nums ${alert ? "text-red-600" : "text-gray-900"}`}>
        {r.rate} %
      </span>
    </div>
  );
}

export function MatchRates({
  rates,
  alertPct,
  minLines,
}: {
  rates: RestaurantMatchRate[];
  alertPct: number;
  minLines: number;
}) {
  const [ouvert, setOuvert] = useState(false);

  // Rendu serveur = replié. On n'ouvre qu'après hydratation, sinon le HTML du
  // serveur et celui du client divergent (React râle, la page clignote).
  useEffect(() => {
    if (lireOuvert()) setOuvert(true);
  }, []);

  if (rates.length === 0) return null;

  const estEnAlerte = (r: RestaurantMatchRate) => r.rate < alertPct && r.total >= minLines;
  const enAlerte = rates.filter(estEnAlerte);
  const reste = rates.filter((r) => !estEnAlerte(r));
  // Taux du réseau : pondéré par les lignes, pas la moyenne des pourcentages —
  // un resto à 3 tickets ne doit pas peser autant qu'un resto à 3 000 lignes.
  const totalLignes = rates.reduce((a, r) => a + r.total, 0);
  const totalRattachees = rates.reduce((a, r) => a + r.matched, 0);
  const tauxReseau = totalLignes > 0 ? Math.round((totalRattachees / totalLignes) * 100) : 0;

  const basculer = () => {
    setOuvert((prev) => {
      ecrireOuvert(!prev);
      return !prev;
    });
  };

  return (
    <section className="mb-8 rounded-lg border border-gray-200 bg-white">
      <button
        type="button"
        onClick={basculer}
        aria-expanded={ouvert}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors rounded-lg"
      >
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`shrink-0 text-gray-400 transition-transform ${ouvert ? "" : "-rotate-90"}`}
        />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-gray-900">
            Rattachement catalogue ↔ tickets — 60 derniers jours
          </span>
          <span className="block text-xs text-gray-500">
            {rates.length} établissement{rates.length > 1 ? "s" : ""} · {tauxReseau} % des lignes rattachées ·{" "}
            {enAlerte.length === 0
              ? `aucun sous ${alertPct} %`
              : `${enAlerte.length} sous ${alertPct} %`}
          </span>
        </span>
        <span className="shrink-0 text-xs text-gray-400">{ouvert ? "Replier" : "Détail"}</span>
      </button>

      {/* Repliée, la fenêtre garde les établissements en alerte : c'est le seul
          contenu de cette section qui demande une action. */}
      {!ouvert && enAlerte.length > 0 && (
        <div className="space-y-1.5 px-3 pb-3">
          {enAlerte.map((r) => (
            <Ligne key={r.restaurantId} r={r} alert />
          ))}
        </div>
      )}

      {ouvert && (
        <div className="border-t border-gray-100 px-3 py-3">
          <p className="mb-3 text-xs text-gray-500">
            Part des lignes de tickets rattachées à un article du catalogue (lignes techniques exclues).
            Sous {alertPct} %, les ventes par plat du resto ne veulent rien dire — la boucle de complétion
            (carte « À faire » de son dashboard) est là pour ça. Sous {minLines} lignes, le pourcentage
            n&apos;alerte pas : il ne veut encore rien dire.
          </p>
          <div className="max-h-80 space-y-1.5 overflow-y-auto">
            {enAlerte.map((r) => (
              <Ligne key={r.restaurantId} r={r} alert />
            ))}
            {reste.map((r) => (
              <Ligne key={r.restaurantId} r={r} alert={false} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
