"use client";

import { MessageCircle } from "lucide-react";
import { TrackedLink } from "@/components/analytics/TrackedLink";
import { Reveal } from "./motion";

// L'analyse gratuite (ADR 0071, maquette du 2026-11-04) : ce qu'elle vérifie,
// et un exemple de résultat. Les quatre contrôles sont ceux de l'analyse
// réelle (fiche Google, avis, voisins à moins de 600 m — lib/audit/places.ts —,
// vitesse mobile). Résultat d'exemple : établissement IMAGINAIRE.

const CHECKS = [
  { q: "Trouve-t-on l'établissement sur Google ?", a: "Horaires, photos, bouton pour commander." },
  { q: "Que disent les avis ?", a: "La note, et les reproches qui reviennent." },
  { q: "Est-il devant ses voisins ?", a: "Comparé aux restaurants à moins de 600 m." },
  { q: "Le site marche-t-il sur téléphone ?", a: "Ce que voit vraiment un client, et la vitesse." },
];

const FIXES = [
  { title: "Ajouter les horaires du dimanche", why: "Google affiche « horaires inconnus »" },
  { title: "Répondre aux 9 avis sans réponse", why: "dont 3 avis à 1 ou 2 étoiles" },
  { title: "Ajouter un lien pour commander", why: "les 2 voisins mieux notés en ont un" },
];

export function AnalysisSection() {
  return (
    <section id="analyse" className="bg-paper-subtle py-20 sm:py-24 scroll-mt-16">
      <div className="max-w-[1200px] mx-auto px-5 sm:px-8 grid lg:grid-cols-[1.1fr_1fr] gap-12 lg:gap-16 items-center">
        <div>
          <Reveal>
            <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-moss-dark mb-3.5">▶ Gratuit · analyse de votre restaurant</p>
            <h2 className="font-display text-[32px] sm:text-[42px] lg:text-[48px] leading-[1.15] tracking-[-0.02em] font-bold text-ink text-pretty">
              Combien de clients perdus avant même qu&apos;ils entrent ?
            </h2>
            <p className="font-landing text-[16.5px] leading-[1.7] text-ink-muted mt-4 mb-0 max-w-[560px]">
              Avant de venir, les clients regardent leur téléphone. L&apos;analyse vérifie ce qu&apos;ils y voient, et
              dit quoi corriger.
            </p>
          </Reveal>
          <div className="grid sm:grid-cols-2 gap-3 mt-8">
            {CHECKS.map((c, i) => (
              <Reveal key={c.q} delay={(i % 2) * 80}>
                <div className="bg-white border border-paper-border rounded-xl p-4 h-full">
                  <p className="text-[15px] font-semibold text-ink m-0">{c.q}</p>
                  <p className="text-[13.5px] text-ink-muted m-0 mt-1">{c.a}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={200}>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <TrackedLink
                ctaId="audit_gratuit"
                ctaLocation="analyse"
                audience="restaurateur"
                href="/audit-gratuit"
                className="bg-moss text-white text-[15px] font-bold px-6 py-3.5 rounded-lg hover:bg-moss-dark transition-colors"
              >
                Analyser mon restaurant
              </TrackedLink>
              <p className="text-[13.5px] text-ink-muted m-0 max-w-[340px]">
                Une note sur 100, puis le rapport complet sur WhatsApp. Les corrections peuvent se faire sans nous.
              </p>
            </div>
          </Reveal>
        </div>

        <Reveal delay={120} y={24}>
          <div className="bg-white border border-paper-border rounded-2xl shadow-[0_24px_60px_rgba(10,10,10,0.12)] p-6 max-w-[440px] mx-auto">
            <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-ink-faint m-0">Exemple de résultat</p>
            <div className="flex items-center gap-4 mt-4">
              <span className="grid place-items-center w-16 h-16 rounded-full border-[5px] border-warn font-display text-[22px] font-bold text-ink">58</span>
              <div>
                <p className="font-display text-[19px] font-bold text-ink m-0">Pizza Joe</p>
                <p className="text-[13.5px] text-ink-muted m-0">4e sur 7 restaurants autour</p>
              </div>
            </div>
            <ol className="mt-5 space-y-3 list-none p-0">
              {FIXES.map((f, i) => (
                <li key={f.title} className="flex gap-3">
                  <span className="grid place-items-center w-6 h-6 rounded-full bg-ink text-white text-[12px] font-bold shrink-0">{i + 1}</span>
                  <div>
                    <p className="text-[14px] font-semibold text-ink m-0">{f.title}</p>
                    <p className="text-[12.5px] text-ink-muted m-0">{f.why}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-5 mb-0 inline-flex items-center gap-2 text-[13px] font-semibold text-good">
              <MessageCircle className="w-4 h-4" aria-hidden /> Le rapport complet arrive sur WhatsApp
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
