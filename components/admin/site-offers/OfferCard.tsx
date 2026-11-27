"use client";

import Link from "next/link";
import { useState } from "react";
import { Card } from "@/components/admin/ui";
import type { ConsoleOffer } from "@/lib/site-offers/console";
import { STOP_LABEL, STOP_REASONS, type StopReason } from "@/lib/site-offers/offers";
import { checkBox, ghostButton } from "../site-orders/info-ui";

// Une offre dans la liste (ADR 0110, maquette) : son état, ses chiffres, « Arrêter maintenant » avec sa raison, « Reprendre ».

type Props = {
  offer: ConsoleOffer;
  canWrite: boolean;
  menuHref: string;
  onEdit: () => void;
  onPreview: () => void;
  onCopy: () => void;
  onStop: (reason: StopReason) => Promise<string | null>;
};

export function OfferCard({ offer, canWrite, menuHref, onEdit, onPreview, onCopy, onStop }: Props) {
  const [stopping, setStopping] = useState(false);
  const [reason, setReason] = useState<StopReason | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const live = offer.phase === "en_cours" || offer.phase === "a_venir" || offer.phase === "masquee";
  const past = offer.phase === "terminee" || offer.phase === "arretee";
  const panel = `stop-${offer.id}`;

  async function confirm() {
    if (!reason) return;
    setBusy(true);
    setError(null);
    const failed = await onStop(reason);
    setBusy(false);
    if (failed) setError(failed);
  }

  return (
    <Card padding="p-4">
      <div className="space-y-2.5">
        <p className={`text-[13px] font-semibold ${offer.phase === "en_cours" ? "text-boost-olive-dark" : "text-ink-muted"}`}>{offer.status}</p>
        <h2 className="break-words text-[17px] font-semibold text-ink">{offer.title}</h2>
        {offer.line && <p className="text-[13px] text-ink-muted">{offer.line}</p>}
        {offer.warning && <p className="rounded-lg border border-warn bg-warn/10 px-3.5 py-3 text-[15px] text-ink">{offer.warning}</p>}
        {offer.counts && <p className="text-[15px] text-ink">{offer.counts}</p>}
        <div className="flex flex-col gap-2">
          {offer.phase === "masquee" && <Link href={menuHref} className={ghostButton}>Voir le plat</Link>}
          {offer.phase === "brouillon" && canWrite && (
            <>
              <button type="button" onClick={onPreview} className={ghostButton}>Voir l&apos;aperçu et publier</button>
              <button type="button" onClick={onEdit} className={ghostButton}>Modifier le brouillon</button>
            </>
          )}
          {live && (
            <button type="button" aria-expanded={stopping} aria-controls={panel} onClick={() => { setStopping((s) => !s); setError(null); }} className={ghostButton}>Arrêter maintenant</button>
          )}
          {past && canWrite && <button type="button" onClick={onCopy} className={ghostButton}>Reprendre avec de nouvelles dates</button>}
        </div>
        {live && stopping && (
          <div id={panel} className="rounded-lg border border-paper-border bg-paper-subtle p-3.5">
            <fieldset>
              <legend className="text-[15px] font-semibold text-ink">Pourquoi l&apos;arrêter ?</legend>
              {STOP_REASONS.map((r) => (
                <label key={r} className="flex min-h-[44px] items-center gap-3 text-[15px] text-ink">
                  <input type="radio" name={`why-${offer.id}`} className={checkBox} checked={reason === r} onChange={() => setReason(r)} />
                  {STOP_LABEL[r]}
                </label>
              ))}
            </fieldset>
            <p className="mb-2 mt-1 text-[13px] text-ink-muted">Les commandes déjà reçues y ont encore droit.</p>
            {error && <p role="alert" className="mb-2 text-[15px] text-danger">{error}</p>}
            <button type="button" disabled={!reason || busy} onClick={() => void confirm()} className={`${ghostButton} w-full`}>{busy ? "Arrêt…" : "Confirmer l'arrêt"}</button>
          </div>
        )}
      </div>
    </Card>
  );
}
