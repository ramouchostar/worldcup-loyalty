"use client";

import { useRef, useState } from "react";
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
] as const;
type ChannelKey = (typeof CHANNELS)[number][0];

// « Téléphone / WhatsApp » retiré le 2026-09-26 (demande du porteur : ce n'est
// pas un canal de vente à part, une commande par téléphone finit sur place ou
// à emporter). Une ancienne réponse qui en avait est reversée dans « À emporter »
// pour que la répartition fasse toujours 100 %.
function initialMix(initial: OwnerAnswers | null): Record<ChannelKey, number> {
  const c = initial?.channels;
  if (!c) return { surPlace: 0, emporter: 0, uberEats: 0, deliveroo: 0, takeaway: 0 };
  return { surPlace: c.surPlace, emporter: c.emporter + (c.direct ?? 0), uberEats: c.uberEats, deliveroo: c.deliveroo, takeaway: c.takeaway };
}

// Le bouton n'est jamais désactivé pour une répartition fausse (2026-10-03) :
// désactivé, il restait identique à l'œil et « ne répondait plus » sur iPad.
// Il reste cliquable, et le clic dit ce qui bloque (voir onSubmit).
function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={s.cta} disabled={pending}>
      {pending ? "Révision de l'audit…" : "Réviser l'audit avec ces réponses"}
    </button>
  );
}

export function AnswersForm({ action, initial }: { action: (fd: FormData) => void; initial: OwnerAnswers | null }) {
  const [open, setOpen] = useState(false);
  const [mix, setMix] = useState<Record<ChannelKey, number>>(() => initialMix(initial));
  const total = Object.values(mix).reduce((a, b) => a + b, 0);
  const mixOk = total === 0 || total === 100;
  const [blocked, setBlocked] = useState(false);
  const channelsRef = useRef<HTMLDivElement>(null);
  const gap = total < 100 ? `il manque ${100 - total} %` : `${total - 100} % de trop`;

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
    <form
      action={action}
      onSubmit={(e) => {
        if (mixOk) return;
        e.preventDefault();
        setBlocked(true);
        channelsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }}
      className={s.card}
      style={{ display: "flex", flexDirection: "column", gap: 18 }}
    >
      <div>
        <span className={s.eyebrow}>Approfondir</span>
        <h2 style={{ margin: 0, fontSize: 20 }}>Questions au gérant</h2>
        <p className={s.lead}>Ses réponses révisent l&apos;audit : priorités, objectif et calendrier. Les notes restent celles mesurées.</p>
      </div>
      <div className={s.q} ref={channelsRef}>
        <div className={s.bar}>
          <b>Répartition du chiffre d&apos;affaires par canal</b>
          <span className={mixOk ? s.sum : `${s.sum} ${s.sumOff}`}>
            Total : {total} %{mixOk ? "" : ` — ${gap}`}
          </span>
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
      {blocked && !mixOk && (
        <p role="alert" className={s.formError}>
          <b>L&apos;audit n&apos;a pas été révisé : la répartition par canal fait {total} % au lieu de 100 % ({gap}).</b>{" "}
          Ajuste les curseurs pour arriver à 100 %, ou remets-les tous à 0 si le gérant ne l&apos;a pas donnée.
        </p>
      )}
      <Submit />
    </form>
  );
}
