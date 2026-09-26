"use client";

import { Gift, MapPin, Megaphone, Repeat, ShoppingBag } from "lucide-react";
import { FillBar } from "./motion";
import { PhoneFrame } from "./PhoneFrame";

// Héros (2026-09-26, inspiré d'owner.com) : la console restaurateur en vue
// simple (ADR 0064 — accueil, objectif du jour, à faire, onglets Accueil ·
// Tickets · Annonces · Plus), dans un iPhone, avec une ligne par pilier de
// l'offre (ADR 0070) : commandes en ligne, Google, fidélité, publicité.
// Données d'illustration figées (établissement fictif Belchicken), comme les
// autres mockups de la page. Jamais « grâce à nous » (ADR 0064) : on montre
// une origine et un nombre, pas un chiffre d'affaires additionnel.

const MONTH_ROWS = [
  { icon: ShoppingBag, label: "Commandes en ligne", value: "214", note: "0 € de commission" },
  { icon: MapPin, label: "Ta place sur Google", value: "3ᵉ", note: "+6 places", good: true },
  { icon: Repeat, label: "Clients revenus", value: "38", note: "cette semaine" },
  { icon: Megaphone, label: "Pub Instagram", value: "1 932 €", note: "de commandes" },
];

const TABS = ["Accueil", "Tickets", "Annonces", "Plus"];

export function HeroPhoneMockup() {
  return (
    <PhoneFrame>
        <div className="h-9" />

        <div className="px-4 pt-3 pb-4 flex flex-col gap-2.5">
          {/* En-tête établissement */}
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-white border border-paper-border flex items-center justify-center font-display font-bold text-[13px] text-ink">
              B
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-ink m-0 leading-tight">Belchicken Kraainem</p>
              <p className="text-[10.5px] text-ink-faint m-0">Samedi · ta journée</p>
            </div>
          </div>

          {/* Objectif du jour */}
          <div className="bg-ink rounded-xl px-3.5 py-3">
            <div className="flex items-baseline justify-between">
              <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-moss-light m-0">Objectif du jour</p>
              <p className="text-[11px] text-white/70 m-0">
                <span className="font-display text-[15px] font-bold text-white">18</span> / 25 tickets
              </p>
            </div>
            <FillBar
              percent={72}
              trackClassName="mt-2 h-1.5 rounded-full bg-white/15 overflow-hidden"
              className="h-full rounded-full bg-moss"
            />
          </div>

          {/* Ce mois-ci : un pilier par ligne */}
          <div className="bg-white border border-paper-border rounded-xl px-3.5 py-2.5">
            <p className="font-mono text-[9px] tracking-[0.12em] uppercase text-ink-faint m-0 mb-1">Ce mois-ci</p>
            {MONTH_ROWS.map((r) => (
              <div
                key={r.label}
                className="flex items-center gap-2.5 py-2 border-b border-paper-border last:border-b-0"
              >
                <span className="w-7 h-7 shrink-0 rounded-lg bg-moss-tint flex items-center justify-center">
                  <r.icon className="w-3.5 h-3.5 text-moss-dark" strokeWidth={2.2} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold text-ink m-0 leading-tight">{r.label}</p>
                  <p className={`text-[10px] m-0 ${r.good ? "text-moss-dark font-semibold" : "text-ink-faint"}`}>
                    {r.note}
                  </p>
                </div>
                <span className="font-display text-[15px] font-bold text-ink">{r.value}</span>
              </div>
            ))}
          </div>

          {/* À faire */}
          <div className="bg-white border border-paper-border rounded-xl px-3.5 py-3 flex items-center gap-2.5">
            <span className="w-7 h-7 shrink-0 rounded-lg bg-paper-subtle flex items-center justify-center">
              <Gift className="w-3.5 h-3.5 text-ink" strokeWidth={2.2} />
            </span>
            <p className="text-[12px] text-ink m-0 flex-1 leading-tight">
              <span className="font-semibold">2 cadeaux</span> à préparer ce midi
            </p>
            <span className="text-[11px] font-bold text-white bg-ink rounded-md px-2.5 py-1.5">Voir</span>
          </div>
        </div>

        {/* Onglets de la vue simple */}
        <div className="border-t border-paper-border bg-white grid grid-cols-4 px-2 pt-2 pb-5">
          {TABS.map((t, i) => (
            <span
              key={t}
              className={`text-center text-[10px] ${i === 0 ? "font-bold text-moss-dark" : "text-ink-faint"}`}
            >
              {t}
            </span>
          ))}
        </div>
    </PhoneFrame>
  );
}
