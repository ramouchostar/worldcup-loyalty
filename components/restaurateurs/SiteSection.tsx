"use client";

import { ArrowRight, MapPin, Phone } from "lucide-react";
import type { AssistantId } from "@/lib/agents/types";
import { Reveal } from "./motion";
import { PhoneFrame } from "./PhoneFrame";
import { Portrait } from "./Portrait";
import { assistant } from "./brigade";

// Le site de Nina (Brigade 17, maquette du 2026-11-04 ; ADR 0088) : un site
// pensé pour Google, fait depuis la base, vers lequel la brigade envoie les
// clients. EN PILOTE (ADR 0070 : jamais au présent comme disponible).
// Écarts à la maquette, voulus :
// - le bouton « Commander » mène au site de commande de l'établissement :
//   Boosteats ne prend ni commande ni paiement (ADR 0088 §3), donc pas de
//   notification « Nouvelle commande en direct » ;
// - la commission des plateformes s'écrit « jusqu'à 30 % selon le contrat »,
//   sans exemple chiffré (décision du 2026-11-05).
// Site d'illustration : établissement IMAGINAIRE (Smashly, Ixelles).

const SENDERS: { id: AssistantId; text: string }[] = [
  { id: "max", text: "envoie ceux qui cherchent sur Google" },
  { id: "emma", text: "envoie ceux qui voient la pub" },
  { id: "hugo", text: "envoie les clients fidèles" },
];

export function SiteSection() {
  return (
    <section id="site" className="bg-ink scroll-mt-16 overflow-hidden">
      <div className="max-w-[1200px] mx-auto px-5 sm:px-8 py-20 sm:py-24 grid lg:grid-cols-[1.1fr_1fr] gap-12 lg:gap-16 items-center">
        <div>
          <Reveal>
            <div className="flex items-center gap-3 mb-4">
              <Portrait id="nina" size={44} />
              <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-moss-light m-0">Le site, par Nina</p>
              <span className="text-[11px] font-semibold text-ink bg-moss-light rounded-full px-2.5 py-1">En pilote</span>
            </div>
            <h2 className="font-display text-[32px] sm:text-[42px] lg:text-[50px] leading-[1.15] tracking-[-0.02em] font-bold text-white text-pretty">
              Les clients commandent chez vous. Pas chez Uber Eats.
            </h2>
            <p className="font-landing text-[16.5px] leading-[1.7] text-night-text mt-4 mb-0 max-w-[560px]">
              Nina prépare un site pensé pour Google, fait depuis la carte, les photos et les horaires de
              l&apos;établissement. C&apos;est là que la brigade envoie les clients. Le bouton « Commander » mène au
              site de commande de l&apos;établissement : Boosteats ne prend ni commande, ni paiement, ni commission.
            </p>
          </Reveal>

          <ul className="mt-8 space-y-3 list-none p-0">
            {SENDERS.map((s, i) => {
              const a = assistant(s.id);
              return (
                <Reveal key={s.id} as="li" delay={i * 90}>
                  <div className="flex items-center gap-3 rounded-xl bg-white/[0.06] border border-white/10 px-4 py-3">
                    <Portrait id={s.id} size={34} />
                    <p className="text-[15px] text-white m-0 flex-1">
                      <span className="font-semibold">{a.name}</span> <span className="text-night-text">{s.text}</span>
                      {a.pilot && <span className="text-night-faint"> (en pilote)</span>}
                    </p>
                    <ArrowRight className="w-4 h-4 text-moss-light shrink-0" aria-hidden />
                  </div>
                </Reveal>
              );
            })}
          </ul>

          <Reveal delay={300}>
            <div className="grid sm:grid-cols-2 gap-3 mt-8">
              <div className="rounded-xl bg-white/[0.06] border border-white/10 px-4 py-4">
                <p className="text-[13px] text-night-text m-0">Commande passée par une plateforme</p>
                <p className="font-display text-[22px] font-bold text-white mt-1 mb-0">jusqu&apos;à 30 %</p>
                <p className="text-[12.5px] text-night-text m-0">de commission, selon le contrat</p>
              </div>
              <div className="rounded-xl bg-moss/15 border border-moss/40 px-4 py-4">
                <p className="text-[13px] text-night-text m-0">La même commande en direct</p>
                <p className="font-display text-[22px] font-bold text-moss-light mt-1 mb-0">0 %</p>
                <p className="text-[12.5px] text-night-text m-0">de commission de plateforme</p>
              </div>
            </div>
            <p className="text-[13px] text-night-faint mt-5 mb-0">
              Dans le forfait Pro, avec quelques établissements pilotes pour commencer.
            </p>
          </Reveal>
        </div>

        <Reveal delay={150} y={28}>
          <div className="flex flex-col items-center">
            <PhoneFrame>
              <div className="h-9" />
              <div className="px-4 pt-2 pb-5 flex flex-col gap-2.5">
                <div className="h-[92px] rounded-xl bg-gradient-to-br from-[#2A1A0E] to-[#7A3B12] flex items-end p-3">
                  <p className="font-display text-[17px] font-bold text-white m-0">Smashly · Ixelles</p>
                </div>
                <p className="text-[11px] text-ink-muted m-0">Ouvert jusqu&apos;à 23 h · 4,6 ★ · 156 avis</p>
                <p className="font-display text-[15px] font-bold text-ink m-0 leading-tight">Le smash burger du quartier</p>
                <div className="rounded-lg bg-moss-tint px-3 py-2 text-[11.5px] font-semibold text-ink">
                  Ce week-end : la boisson offerte avec le menu Smash
                </div>
                {[
                  { name: "Smash burger", desc: "Frites et boisson", price: "11,90 €" },
                  { name: "Menu famille", desc: "4 burgers, 4 frites", price: "32,90 €" },
                ].map((d) => (
                  <div key={d.name} className="flex items-center justify-between bg-white border border-paper-border rounded-lg px-3 py-2">
                    <div>
                      <p className="text-[12px] font-semibold text-ink m-0">{d.name}</p>
                      <p className="text-[10.5px] text-ink-faint m-0">{d.desc}</p>
                    </div>
                    <span className="text-[12px] font-bold text-ink">{d.price}</span>
                  </div>
                ))}
                <span className="grid place-items-center rounded-xl bg-ink text-white text-[14px] font-bold py-2.5 mt-1">Commander</span>
                <div className="flex justify-center gap-4 text-[11px] text-ink-muted">
                  <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" aria-hidden /> Appeler</span>
                  <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" aria-hidden /> Itinéraire</span>
                </div>
              </div>
            </PhoneFrame>
            <p className="text-[12px] text-night-faint text-center mt-4 mb-0">
              Site d&apos;exemple. « Commander » ouvre le site de commande de l&apos;établissement.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
