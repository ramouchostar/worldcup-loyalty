"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import type { OwnerAnswers } from "@/lib/audit/signals";
import s from "./report.module.css";

// ADR 0069 §3 E et §6 — « Approfondir l'audit » : un bouton, puis les
// questions au gérant. L'envoi révise l'audit côté serveur (reviseWithAnswers).

const CHANNELS = [
  ["surPlace", "Sur place"],
  ["emporter", "À emporter"],
  ["uberEats", "Uber Eats"],
  ["deliveroo", "Deliveroo"],
  ["takeaway", "Takeaway.com"],
  ["direct", "Téléphone / WhatsApp"],
] as const;
type ChannelKey = (typeof CHANNELS)[number][0];

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={s.cta} disabled={disabled || pending}>
      {pending ? "Révision de l'audit…" : "Réviser l'audit avec ces réponses"}
    </button>
  );
}

export function AnswersForm({ action, initial }: { action: (fd: FormData) => void; initial: OwnerAnswers | null }) {
  const [open, setOpen] = useState(false);
  const [mix, setMix] = useState<Record<ChannelKey, number>>(
    initial?.channels ?? { surPlace: 0, emporter: 0, uberEats: 0, deliveroo: 0, takeaway: 0, direct: 0 },
  );
  const total = Object.values(mix).reduce((a, b) => a + b, 0);

  if (!open) {
    return (
      <div className={s.center}>
        <button type="button" className={s.cta} onClick={() => setOpen(true)}>
          {initial ? "Modifier les réponses du gérant" : "Approfondir l'audit"}
        </button>
      </div>
    );
  }

  return (
    <form action={action} className={s.card} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <span className={s.eyebrow}>Approfondir</span>
        <h2 style={{ margin: 0, fontSize: 20 }}>Questions au gérant</h2>
        <p className={s.lead}>Ses réponses révisent l&apos;audit : priorités, objectif et calendrier. Les notes restent celles mesurées.</p>
      </div>
      <div className={s.q}>
        <div className={s.bar}>
          <b>Répartition du chiffre d&apos;affaires par canal</b>
          <span className={s.sum}>Total : {total} %{total === 100 ? "" : " (doit faire 100 %)"}</span>
        </div>
        {CHANNELS.map(([key, label]) => (
          <label key={key} className={s.chan} htmlFor={`c-${key}`}>
            <span>{label}</span>
            <input
              id={`c-${key}`}
              name={`c_${key}`}
              type="range"
              min={0}
              max={100}
              step={5}
              value={mix[key]}
              onChange={(e) => setMix((m) => ({ ...m, [key]: Number(e.target.value) }))}
            />
            <b>{mix[key]} %</b>
          </label>
        ))}
      </div>
      <div className={s.qgrid}>
        <label className={s.q} htmlFor="q-hero">
          <b>Produit ou catégorie phare</b>
          <small>Celui qui se vend le mieux</small>
          <input id="q-hero" name="heroProduct" defaultValue={initial?.heroProduct ?? ""} maxLength={80} />
        </label>
        <label className={s.q} htmlFor="q-margin">
          <b>Marge sur ce produit</b>
          <small>En % du prix de vente</small>
          <span className={s.unit}>
            <input id="q-margin" name="heroMarginPct" inputMode="decimal" defaultValue={initial?.heroMarginPct ?? ""} />
            <i>%</i>
          </span>
        </label>
        <label className={s.q} htmlFor="q-prep">
          <b>Temps de préparation moyen</b>
          <small>De la commande à la remise</small>
          <span className={s.unit}>
            <input id="q-prep" name="prepMinutes" inputMode="numeric" defaultValue={initial?.prepMinutes ?? ""} />
            <i>min</i>
          </span>
        </label>
        <label className={s.q} htmlFor="q-ca">
          <b>Chiffre d&apos;affaires actuel</b>
          <small>Par mois</small>
          <span className={s.unit}>
            <input id="q-ca" name="monthlyRevenue" inputMode="numeric" defaultValue={initial?.monthlyRevenue ?? ""} />
            <i>€</i>
          </span>
        </label>
        <label className={s.q} htmlFor="q-goal">
          <b>Objectif de chiffre d&apos;affaires</b>
          <small>Par mois, à 12 mois</small>
          <span className={s.unit}>
            <input id="q-goal" name="monthlyRevenueTarget" inputMode="numeric" defaultValue={initial?.monthlyRevenueTarget ?? ""} />
            <i>€</i>
          </span>
        </label>
      </div>
      <Submit disabled={total !== 0 && total !== 100} />
      {total !== 0 && total !== 100 && <span className={s.sum}>La répartition doit faire 100 % (ou rester à 0 si le gérant ne l&apos;a pas donnée).</span>}
    </form>
  );
}
