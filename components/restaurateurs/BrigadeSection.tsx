"use client";

import Link from "next/link";
import { Reveal } from "./motion";
import { Portrait } from "./Portrait";
import { BRIGADE, PLAN_LABEL } from "./brigade";

// « Votre brigade marketing » (Brigade 17, maquette du 2026-11-04, ADR 0089 §1) :
// les sept assistants, leur poste et le forfait à partir duquel ils travaillent.
// Les portraits sont des personnages créés pour Boosteats (« personnages
// fictifs », ADR 0089 §1) ; Nina et Max portent « En pilote » (ADR 0070).
export function BrigadeSection() {
  return (
    <section id="brigade" className="bg-paper-subtle py-20 sm:py-24 scroll-mt-16">
      <div className="max-w-[1200px] mx-auto px-5 sm:px-8">
        <div className="grid lg:grid-cols-[1fr_auto] gap-8 items-end">
          <Reveal>
            <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-moss-dark mb-3.5">▶ La brigade</p>
            <h2 className="font-display text-[34px] sm:text-[44px] lg:text-[54px] leading-[1.2] tracking-[-0.02em] font-bold text-ink max-w-[680px] text-pretty">
              Votre brigade marketing.
            </h2>
            <p className="font-landing text-[17px] leading-[1.65] text-ink-muted mt-4 mb-0 max-w-[620px] text-pretty">
              Comme en cuisine, chacun son poste. Pas besoin de connaître le marketing : il suffit de savoir qui fait
              quoi.
            </p>
          </Reveal>
          <Reveal delay={80}>
            <div className="bg-ink rounded-2xl px-6 py-5 max-w-[320px]">
              <p className="font-display text-[40px] leading-none font-bold text-moss-light m-0">1</p>
              <p className="text-[15px] font-semibold text-white mt-2 mb-0">seul objectif : faire monter votre chiffre d&apos;affaires</p>
            </div>
          </Reveal>
        </div>

        <ul className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-10 list-none p-0">
          {BRIGADE.map((a, i) => (
            <Reveal key={a.id} as="li" delay={(i % 4) * 70}>
              <Link
                href={a.href}
                className="group h-full bg-white border border-paper-border rounded-xl p-5 flex flex-col hover:border-moss transition-colors"
              >
                <div className="flex items-center gap-3.5">
                  <Portrait id={a.id} size={64} />
                  <div className="min-w-0">
                    <p className="font-display text-[19px] font-bold text-ink m-0">{a.name}</p>
                    <p className="text-[12px] font-semibold text-moss-dark m-0">
                      {a.plan === "gratuit" ? "Dès le Gratuit" : `Forfait ${PLAN_LABEL[a.plan]}`}
                    </p>
                  </div>
                </div>
                <p className="text-[15px] leading-snug text-ink-body mt-4 mb-0 flex-1">{a.post}</p>
                <div className="mt-4 flex items-center justify-between gap-2">
                  {a.pilot ? (
                    <span className="text-[11px] font-semibold text-white bg-ink rounded-full px-2.5 py-1">En pilote</span>
                  ) : (
                    <span />
                  )}
                  <span className="text-[13px] font-semibold text-ink-muted group-hover:text-moss-dark">Voir →</span>
                </div>
              </Link>
            </Reveal>
          ))}
          <Reveal as="li" delay={210}>
            <div className="h-full rounded-xl border border-dashed border-paper-border p-5 flex flex-col justify-center">
              <p className="text-[14px] leading-relaxed text-ink-muted m-0">
                Le nombre d&apos;assistants dépend du forfait. On commence gratuitement avec quatre, et on agrandit la
                brigade quand on veut.
              </p>
              <Link href="/#plans" className="text-[14px] font-semibold text-moss-dark hover:underline mt-3">
                Voir les tarifs →
              </Link>
            </div>
          </Reveal>
        </ul>

        <p className="text-[12.5px] text-ink-faint mt-6 mb-0">
          Personnages fictifs, créés pour Boosteats. Nina et Max sont en pilote dans le forfait Pro, avec quelques
          établissements.
        </p>
      </div>
    </section>
  );
}
