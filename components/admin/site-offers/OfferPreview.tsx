"use client";

import { useState } from "react";
import { Card, PageHeader } from "@/components/admin/ui";
import type { ConsoleOffer } from "@/lib/site-offers/console";
import { checkBox, ghostButton, primaryButton, textLink } from "../site-orders/info-ui";

// « Voici ce que verront tes clients » (ADR 0110 §3, maquette) : l'aperçu exact, la case « Mon équipe est prévenue », puis
// « Oui, publier ». Une offre publiée ne se modifie plus.

const Row = ({ term, children }: { term: string; children: string }) => (
  <div className="border-t border-paper-border py-3">
    <dt className="text-[15px] font-semibold text-ink">{term}</dt>
    <dd className="mt-0.5 break-words text-[15px] text-ink-muted">{children}</dd>
  </div>
);

export function OfferPreview({ offer, onEdit, onLater, onPublish }: { offer: ConsoleOffer; onEdit: () => void; onLater: () => void; onPublish: () => Promise<string | null> }) {
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function publish() {
    setBusy(true);
    setError(null);
    const failed = await onPublish();
    setBusy(false);
    if (failed) setError(failed);
  }

  return (
    <div className="space-y-4">
      <button type="button" onClick={onEdit} className={ghostButton}>Modifier</button>
      <PageHeader title="Voici ce que verront tes clients" subtitle="Rien n'est visible tant que tu n'as pas dit oui." />
      <Card padding="p-4">
        <div className="rounded-lg border border-boost-olive bg-boost-olive/10 px-3.5 py-3">
          <p className="text-[13px] font-semibold text-boost-olive-dark">Offre</p>
          <h2 className="break-words text-[17px] font-semibold text-ink">{offer.title}</h2>
          <p className="text-[13px] text-ink-body">{offer.short}</p>
        </div>
        <dl className="mt-3">
          <Row term="Quand">{offer.long}</Row>
          {offer.conditions !== null && <Row term="Conditions">{offer.conditions}</Row>}
          {offer.dishName !== null && <Row term="Plat concerné">{offer.dishName}</Row>}
          <Row term="Ajouté par la page">La remise se fait au comptoir. Le total affiché sur le site ne la compte pas.</Row>
        </dl>
      </Card>
      <p className="rounded-lg border border-warn bg-warn/10 px-3.5 py-3 text-[15px] text-ink">Une fois publiée, l&apos;offre ne se modifie plus. Tu peux l&apos;arrêter à tout moment et la reprendre.</p>
      <label className="flex min-h-[44px] items-start gap-3 text-[15px] text-ink">
        <input type="checkbox" className={`${checkBox} mt-0.5`} checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        <span>Mon équipe est prévenue : on applique cette offre au comptoir.</span>
      </label>
      {error && <p role="alert" className="text-[15px] font-semibold text-danger">{error}</p>}
      <div className="flex flex-col gap-1">
        <button type="button" disabled={!confirmed || busy} onClick={() => void publish()} className={`${primaryButton} w-full`}>{busy ? "Publication…" : "Oui, publier"}</button>
        <p role="status" className="text-center text-[13px] text-ink-muted">{confirmed ? "Visible pour tes clients dès le premier jour choisi." : "Coche la case pour allumer le bouton."}</p>
        <button type="button" disabled={busy} onClick={onLater} className={`${textLink} justify-center`}>Pas maintenant</button>
      </div>
    </div>
  );
}
