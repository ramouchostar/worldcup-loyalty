"use client";

import { TrackedLink } from "@/components/analytics/TrackedLink";
import { Reveal } from "./motion";

// ADR 0070 §2 (Pro) — référencement Google expliqué sans jargon : « ta place
// quand on cherche à manger près de chez toi ». Pas encore livré : places
// pilotes. L'engagement de 3 mois est annoncé ici, avec sa raison.
// L'audit gratuit renvoie vers l'audit plateforme (ADR 0069), lancé à la main
// par l'équipe — d'où un e-mail, pas un formulaire.

const POINTS = [
  "Un site rapide, sur ton propre nom de domaine : il t'appartient",
  "Ta fiche Google tenue à jour : horaires, photos, bouton « Commander »",
  "Tes clients invités à laisser un avis après leur commande, au bon moment",
  "Chaque mois, un rapport simple : ta place sur Google, combien de gens t'ont trouvé, combien ont commandé",
];

const RESULTS = [
  { rank: 1, name: "Belchicken Kraainem", meta: "★ 4,6 · Poulet frit · Ouvert", yours: true },
  { rank: 2, name: "Autre restaurant", meta: "★ 4,2 · Snack · Ouvert", yours: false },
  { rank: 3, name: "Autre restaurant", meta: "★ 4,4 · Burgers · Ferme à 22 h", yours: false },
];

export function GoogleSection() {
  return (
    <section id="google" className="bg-paper-subtle py-20 sm:py-24 scroll-mt-16">
      <div className="max-w-[1200px] mx-auto px-5 sm:px-8">
        <div className="grid lg:grid-cols-[1.15fr_1fr] gap-10 lg:gap-14 items-center">
          <Reveal>
            <div>
              <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-moss-dark mb-4">
                ▶ Référencement Google · places pilotes
              </p>
              <h2 className="font-display text-[34px] sm:text-[44px] lg:text-[54px] leading-[1.2] tracking-[-0.02em] font-bold text-ink text-pretty">
                Quand on cherche à manger près de chez toi, c&apos;est toi qu&apos;on trouve.
              </h2>
              <p className="font-landing text-base leading-[1.7] text-ink-muted mt-5">
                Le référencement, c&apos;est ta place dans les résultats de Google et de Google Maps. Plus tu es haut,
                plus on t&apos;appelle, plus on passe, plus on commande. Ça demande du temps et du savoir-faire
                technique : avec le plan Pro, on s&apos;en occupe pour toi.
              </p>
              <div className="flex flex-col gap-2.5 mt-6">
                {POINTS.map((point) => (
                  <p key={point} className="text-[14.5px] text-ink-body m-0">
                    <span className="font-mono text-moss">✓</span>&nbsp; {point}
                  </p>
                ))}
              </div>
              <p className="text-xs text-ink-faint mt-5">
                Le référencement ne se joue pas en une semaine : les premiers effets se voient en général après 2 à 3
                mois. C&apos;est pour ça que le plan Pro demande 3 mois minimum.
              </p>
              <TrackedLink
                ctaId="audit_gratuit"
                ctaLocation="google"
                audience="restaurateur"
                href="mailto:contact@boosteats.tech?subject=Audit%20gratuit%20de%20ma%20fiche%20Google"
                className="inline-block mt-6 border-[1.5px] border-moss text-moss-dark text-sm font-bold rounded-lg px-5 py-3 hover:bg-moss-tint transition-colors"
              >
                Recevoir l&apos;audit gratuit de ma fiche Google →
              </TrackedLink>
            </div>
          </Reveal>

          <Reveal delay={120} y={28}>
            <div className="bg-white border border-paper-border rounded-xl p-5 shadow-[0_12px_32px_rgba(10,10,10,0.08)]">
              <div className="flex items-center gap-2.5 border border-paper-border rounded-full px-4 py-2.5">
                <span className="text-ink-faint text-sm" aria-hidden>
                  ⌕
                </span>
                <span className="text-[14px] text-ink-body">poulet frit près de moi</span>
              </div>
              <div className="flex flex-col gap-2 mt-4">
                {RESULTS.map((r) => (
                  <div
                    key={`${r.rank}-${r.name}`}
                    className={`flex items-center justify-between gap-3 rounded-lg px-4 py-3 ${
                      r.yours ? "bg-moss-tint border-[1.5px] border-moss" : "bg-paper-subtle"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-display text-lg font-bold text-ink w-5 shrink-0">{r.rank}</span>
                      <div className="min-w-0">
                        <p className={`text-[14.5px] font-semibold m-0 truncate ${r.yours ? "text-ink" : "text-ink-muted"}`}>
                          {r.name}
                        </p>
                        <p className="text-xs text-ink-faint m-0">{r.meta}</p>
                      </div>
                    </div>
                    {r.yours && (
                      <span className="shrink-0 bg-moss text-white text-xs font-bold rounded-md px-3 py-1.5">
                        Commander
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div className="border-t border-paper-border mt-5 pt-4">
                <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-ink-faint m-0 mb-2">
                  Exemple de rapport mensuel
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <Stat value="9ᵉ → 3ᵉ" label="ta place sur « poulet frit Kraainem »" />
                  <Stat value="2 140" label="personnes t'ont vu sur Google" />
                  <Stat value="61" label="commandes venues de Google" />
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="font-display text-lg font-bold text-ink m-0">{value}</p>
      <p className="text-[11px] leading-snug text-ink-faint mt-0.5 mb-0">{label}</p>
    </div>
  );
}
