"use client";

import { useState } from "react";
import { PageHeader } from "@/components/admin/ui";
import type { ConsoleOffer } from "@/lib/site-offers/console";
import { CONDITIONS_MAX, MAX_DAYS, TITLE_MAX } from "@/lib/site-offers/offers";
import { checkBox, ghostButton, primaryButton, textField, textLink } from "../site-orders/info-ui";

// « Nouvelle offre » (ADR 0110, maquette) : un titre, des conditions et un plat facultatifs, deux dates, les jours où elle
// vaut. Le serveur relit tout.

export type OfferDraft = {
  id: string | null;
  copiedFrom: string | null;
  fields: { title: string; conditions: string; itemId: string; firstDay: string; lastDay: string; weekdays: number[] };
};

const EVERY_DAY = [1, 2, 3, 4, 5, 6, 7];
const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export const emptyDraft = (): OfferDraft => ({ id: null, copiedFrom: null, fields: { title: "", conditions: "", itemId: "", firstDay: "", lastDay: "", weekdays: EVERY_DAY } });

/** « Modifier » rouvre le brouillon ; « Reprendre » recopie une ancienne offre, sans ses dates, en nouveau brouillon. */
export function draftFrom(o: ConsoleOffer, how: "modifier" | "reprendre"): OfferDraft {
  const again = how === "reprendre";
  return {
    id: again ? null : o.id,
    copiedFrom: again ? o.id : null,
    fields: { title: o.title, conditions: o.conditions ?? "", itemId: o.itemId ?? "", firstDay: again ? "" : o.firstDay, lastDay: again ? "" : o.lastDay, weekdays: o.weekdays ?? EVERY_DAY },
  };
}

type Props = {
  initial: OfferDraft;
  dishes: { id: string; name: string }[];
  today: string;
  onBack: () => void;
  onSave: (draft: OfferDraft, then: "apercu" | "liste") => Promise<string | null>;
};

export function OfferForm({ initial, dishes, today, onBack, onSave }: Props) {
  const [fields, setFields] = useState(initial.fields);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<OfferDraft["fields"]>) => { setFields((f) => ({ ...f, ...patch })); setError(null); };

  async function save(then: "apercu" | "liste") {
    setBusy(true);
    setError(null);
    const failed = await onSave({ ...initial, fields }, then);
    setBusy(false);
    if (failed) setError(failed);
  }

  const missingDish = fields.itemId !== "" && !dishes.some((d) => d.id === fields.itemId);

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save("apercu"); }}>
      <button type="button" onClick={onBack} className={ghostButton}>Retour aux offres</button>
      <PageHeader title={initial.id ? "Modifier le brouillon" : "Nouvelle offre"} subtitle="Tes clients la voient sur ta page de commande, seulement après ton oui." />

      <label className="flex flex-col gap-1 text-[15px] font-semibold text-ink">
        Titre
        <input type="text" maxLength={TITLE_MAX} value={fields.title} placeholder="Ce que le client gagne, en une phrase" onChange={(e) => set({ title: e.target.value })} className={`${textField} font-normal`} />
        <span className="text-[13px] font-normal text-ink-muted">{TITLE_MAX} caractères au plus</span>
      </label>

      <label className="flex flex-col gap-1 text-[15px] font-semibold text-ink">
        Conditions (facultatif)
        <textarea maxLength={CONDITIONS_MAX} rows={3} value={fields.conditions} placeholder="Par exemple : ce qu'il faut commander, combien de fois" onChange={(e) => set({ conditions: e.target.value })} className={`${textField} font-normal`} />
      </label>

      <label className="flex flex-col gap-1 text-[15px] font-semibold text-ink">
        Plat concerné (facultatif)
        <select value={fields.itemId} onChange={(e) => set({ itemId: e.target.value })} className={`${textField} font-normal`}>
          <option value="">Aucun plat précis</option>
          {missingDish && <option value={fields.itemId}>Un plat qui n&apos;est plus proposé</option>}
          {dishes.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </label>

      <div>
        <div className="flex flex-wrap gap-2">
          <label className="flex min-w-0 flex-1 basis-[140px] flex-col gap-1 text-[15px] font-semibold text-ink">
            Premier jour
            <input type="date" value={fields.firstDay} onChange={(e) => set({ firstDay: e.target.value })} className={`${textField} font-normal`} />
          </label>
          <label className="flex min-w-0 flex-1 basis-[140px] flex-col gap-1 text-[15px] font-semibold text-ink">
            Dernier jour
            <input type="date" min={fields.firstDay || today} value={fields.lastDay} onChange={(e) => set({ lastDay: e.target.value })} className={`${textField} font-normal`} />
          </label>
        </div>
        <p className="mt-1 text-[13px] text-ink-muted">{MAX_DAYS} jours au plus. L&apos;offre disparaît toute seule le lendemain du dernier jour.</p>
      </div>

      <fieldset className="min-w-0">
        <legend className="mb-1 text-[15px] font-semibold text-ink">Jours où elle vaut</legend>
        <div className="grid grid-cols-4 gap-2">
          {DAYS.map((label, i) => (
            <label key={label} className="flex min-h-[44px] items-center gap-2.5 text-[15px] text-ink">
              <input type="checkbox" className={checkBox} checked={fields.weekdays.includes(i + 1)}
                onChange={(e) => set({ weekdays: e.target.checked ? [...fields.weekdays, i + 1].sort((a, b) => a - b) : fields.weekdays.filter((d) => d !== i + 1) })} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <p className="rounded-lg border border-paper-border bg-paper-subtle px-3.5 py-3 text-[15px] text-ink">Aucun prix ne change sur le site. Ton équipe fait la remise au comptoir.</p>

      {error && <p role="alert" className="text-[15px] font-semibold text-danger">{error}</p>}
      <div className="flex flex-col gap-1">
        <button type="submit" disabled={busy} className={`${primaryButton} w-full`}>Voir l&apos;aperçu</button>
        <button type="button" disabled={busy} onClick={() => void save("liste")} className={`${textLink} justify-center`}>Garder en brouillon</button>
      </div>
    </form>
  );
}
