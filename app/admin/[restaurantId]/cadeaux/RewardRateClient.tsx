"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Gift, Info, Wallet } from "lucide-react";
import { PageHeader, Card } from "@/components/admin/ui";
import { balanceMultiplier, previewRate, rateOptions } from "@/lib/reward-rate";

// ADR 0068 — un pourcentage ne parle à personne ; ce qu'il donne, si.
// L'écran traduit chaque taux en VITESSE (« un Beef Menu après 3 tickets »)
// et en COÛT (« au plus 98 € ce mois-ci »), avec les vrais chiffres de
// l'établissement. Aucune promesse d'acquisition : rien dans nos données ne
// relie un taux à un nombre de clients (bouclier ADR 0065).

type RateHistory = { old_pct: number | null; new_pct: number; members_adjusted: number; changed_at: string };

const euro = (n: number) => n.toLocaleString("fr-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export function RewardRateClient({
  restaurantId,
  currentPct,
  avgBasket,
  ticketPoints,
  monthlyProgramRevenue,
  monthlyRewardsCost,
  referenceItems,
  catalogueSize,
  history,
}: {
  restaurantId: string;
  currentPct: number;
  avgBasket: number;
  ticketPoints: number;
  monthlyProgramRevenue: number;
  monthlyRewardsCost: number;
  referenceItems: { name: string; costPrice: number }[];
  catalogueSize: number;
  history: RateHistory[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(currentPct);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const options = rateOptions();
  const preview = useMemo(
    () => previewRate({ pct: selected, avgBasket, monthlyProgramRevenue, items: referenceItems }),
    [selected, avgBasket, monthlyProgramRevenue, referenceItems]
  );
  const multiplier = balanceMultiplier(currentPct, selected);
  const changed = Math.abs(selected - currentPct) > 1e-9;

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/admin/reward-rate", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId, pct: selected }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    setBusy(false);
    setConfirming(false);
    if (!res?.ok) {
      setMsg({ kind: "err", text: data?.error ?? "Enregistrement impossible. Réessaie." });
      return;
    }
    setMsg({
      kind: "ok",
      text:
        data.membersAdjusted > 0
          ? `Taux enregistré. ${data.membersAdjusted} client${data.membersAdjusted > 1 ? "s ont" : " a"} vu son solde de points ajusté : personne ne perd ce qu'il avait gagné.`
          : "Taux enregistré.",
    });
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={<>Cadeaux</>}
        subtitle={<>Ce que tu rends à tes clients, et ce que ça te coûte. Panier moyen : {euro(avgBasket)} ({ticketPoints} points par ticket).</>}
      />

      <Card>
        <h2 className="font-bold text-ink flex items-center gap-1.5 mb-1">
          <Gift size={16} strokeWidth={1.8} aria-hidden="true" /> Ton taux cadeaux
        </h2>
        <p className="text-xs text-ink-muted mb-4">
          Sur 100 € encaissés par le programme, voilà ce qui repart en cadeaux. Il fixe le prix en
          points de tes {catalogueSize} articles, le plafond du mois et les cadeaux d&apos;équipe.
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          {options.map((pct) => {
            const active = Math.abs(pct - selected) < 1e-9;
            const isCurrent = Math.abs(pct - currentPct) < 1e-9;
            return (
              <button
                key={pct}
                type="button"
                onClick={() => setSelected(pct)}
                aria-pressed={active}
                className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                  active
                    ? "bg-brand-dark text-white border-brand-dark"
                    : "bg-white text-ink-body border-paper-border hover:bg-paper"
                }`}
              >
                {Math.round(pct * 100)} %{isCurrent ? " · actuel" : ""}
              </button>
            );
          })}
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="rounded-xl border border-paper-border p-4">
            <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">
              Ce que ça donne à tes clients
            </p>
            {preview.items.length === 0 ? (
              <p className="text-sm text-ink-muted">Aucun article au catalogue pour l&apos;instant.</p>
            ) : (
              <ul className="space-y-1.5">
                {preview.items.map((item) => (
                  <li key={item.name} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-ink truncate">{item.name}</span>
                    <span className="text-ink-muted shrink-0 tabular-nums">
                      {item.pricePoints.toLocaleString("fr-BE")} pts ·{" "}
                      <strong className="text-ink">{item.tickets} ticket{item.tickets > 1 ? "s" : ""}</strong>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-ink-faint mt-2">
              Nombre de tickets de ton panier moyen pour obtenir l&apos;article.
            </p>
          </div>

          <div className="rounded-xl border border-paper-border p-4">
            <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Wallet size={14} strokeWidth={1.8} aria-hidden="true" /> Ce que ça te coûte
            </p>
            <p className="text-2xl font-black text-ink tabular-nums">{euro(preview.monthlyCeiling)}</p>
            <p className="text-xs text-ink-muted">
              au plus ce mois-ci, sur {euro(monthlyProgramRevenue)} encaissés par le programme.
            </p>
            <p className="text-xs text-ink-muted mt-2">
              Déjà offert ce mois-ci : <strong className="text-ink">{euro(monthlyRewardsCost)}</strong>.
            </p>
          </div>
        </div>

        {changed && (
          <div className="mt-4 rounded-xl bg-paper-subtle p-4 text-sm text-ink-body">
            <p className="flex items-start gap-2">
              <Info size={15} strokeWidth={1.8} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                {multiplier > 1 ? (
                  <>
                    À {Math.round(selected * 100)} %, tes cadeaux coûtent plus de points. Les points
                    déjà gagnés par tes clients seront <strong>multipliés par {multiplier.toFixed(1)}</strong> :
                    personne ne perd ce qu&apos;il avait gagné.
                  </>
                ) : (
                  <>
                    À {Math.round(selected * 100)} %, tes cadeaux coûtent moins de points. Les points
                    déjà gagnés seront ramenés à la même valeur en cadeaux
                    (<strong>× {multiplier.toFixed(2)}</strong>) : personne ne gagne ni ne perd au change.
                  </>
                )}
              </span>
            </p>
          </div>
        )}

        {msg && (
          <p className={`mt-4 text-sm rounded-lg p-3 border ${msg.kind === "ok" ? "bg-good/10 border-good/30 text-good" : "bg-danger/10 border-danger/30 text-danger"}`}>
            {msg.text}
          </p>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            disabled={!changed || busy}
            onClick={() => setConfirming(true)}
            className="bg-brand-dark text-white font-semibold text-sm px-4 py-2.5 rounded-lg disabled:opacity-40"
          >
            {busy ? "Enregistrement…" : "Enregistrer ce taux"}
          </button>
          {changed && !busy && (
            <button type="button" onClick={() => setSelected(currentPct)} className="text-sm text-ink-muted hover:text-ink">
              Annuler
            </button>
          )}
        </div>
      </Card>

      {history.length > 0 && (
        <Card>
          <h2 className="font-bold text-ink mb-2">Derniers changements</h2>
          <ul className="space-y-1 text-sm text-ink-body">
            {history.map((h) => (
              <li key={h.changed_at} className="flex items-baseline justify-between gap-3">
                <span>
                  {h.old_pct != null ? `${Math.round(h.old_pct * 100)} %` : "—"} → {Math.round(h.new_pct * 100)} %
                  {h.members_adjusted > 0 ? ` · ${h.members_adjusted} solde${h.members_adjusted > 1 ? "s" : ""} ajusté${h.members_adjusted > 1 ? "s" : ""}` : ""}
                </span>
                <span className="text-xs text-ink-faint shrink-0">
                  {new Date(h.changed_at).toLocaleDateString("fr-BE", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirming(false)}>
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md bg-white rounded-2xl p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-black text-ink">
              Passer à {Math.round(selected * 100)} % ?
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-ink-body">
              <li>
                Tes {catalogueSize} articles changent de prix en points — {preview.items[0]?.name} passera à{" "}
                {preview.items[0]?.pricePoints.toLocaleString("fr-BE")} points.
              </li>
              <li>Plafond du mois : {euro(preview.monthlyCeiling)}.</li>
              <li>
                {multiplier > 1
                  ? `Les points de tes clients sont multipliés par ${multiplier.toFixed(1)}.`
                  : multiplier < 1
                    ? `Les points de tes clients sont ramenés (× ${multiplier.toFixed(2)}).`
                    : "Les points de tes clients ne bougent pas."}
              </li>
            </ul>
            <button
              type="button"
              autoFocus
              onClick={save}
              className="mt-5 w-full bg-brand-dark text-white font-bold py-3 rounded-xl"
            >
              Oui, appliquer
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="mt-2 w-full text-sm font-semibold text-ink-muted py-2.5 rounded-xl hover:bg-paper"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
