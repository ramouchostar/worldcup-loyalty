"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { PhoneFrame } from "./PhoneFrame";
import {
  GoogleScreen,
  LoyaltyScreen,
  MessageScreen,
  OrderSiteScreen,
  SourcesScreen,
  TeamScreen,
} from "./TourScreens";

// Visite guidée (2026-09-26) : un iPhone reste fixe pendant qu'on défile, et
// l'écran + le titre changent à chaque fonctionnalité. Peu de texte : c'est
// l'écran qui explique. Le badge dit QUI voit l'écran (ton client / ta
// console), dans quel plan c'est inclus (ADR 0070), et « pilote » tant que
// la fonctionnalité n'est pas livrée — jamais présentée comme disponible.
//
// Mécanique : la section fait STEPS × ~85 vh de haut ; un bloc « sticky »
// occupe l'écran et l'étape active se déduit de la progression du défilement
// dans la section (un setState seulement quand l'étape change). Tous les
// titres restent dans le DOM (lisibles par les moteurs et les lecteurs
// d'écran), seul l'actif est visible. prefers-reduced-motion : pas de fondu.

type Step = {
  id: string;
  plan: string;
  who: "Ton client" | "Ta console";
  title: string;
  line: string;
  Screen: ComponentType;
  lightStatus?: boolean;
  /** Pas encore livré (ADR 0070) : ouverture en places pilotes. */
  pilot?: boolean;
};

const STEPS: Step[] = [
  {
    id: "fidelite",
    plan: "Gratuit",
    who: "Ton client",
    title: "Chaque ticket rapporte des points.",
    line: "Ton client revient chercher son cadeau. Tu en maîtrises le coût.",
    Screen: LoyaltyScreen,
    lightStatus: true,
  },
  {
    id: "equipes",
    plan: "Gratuit",
    who: "Ton client",
    title: "Tes clients viennent en équipe.",
    line: "Bureau, école, salle de sport : chaque équipe recrute pour toi.",
    Screen: TeamScreen,
    lightStatus: true,
  },
  {
    id: "commande",
    pilot: true,
    plan: "Croissance",
    who: "Ton client",
    title: "Ton site de commande, à ton nom.",
    line: "À emporter, payé directement sur ton compte. Sans plateforme.",
    Screen: OrderSiteScreen,
  },
  {
    id: "sources",
    pilot: true,
    plan: "Croissance",
    who: "Ta console",
    title: "Tu sais ce que te rapporte ta pub.",
    line: "Chaque commande dit d'où elle vient.",
    Screen: SourcesScreen,
  },
  {
    id: "google",
    pilot: true,
    plan: "Pro",
    who: "Ta console",
    title: "Tu montes sur Google.",
    line: "On s'occupe de ton référencement. Tu vois ta place chaque mois.",
    Screen: GoogleScreen,
  },
  {
    id: "annonces",
    plan: "Gratuit",
    who: "Ta console",
    title: "Un mardi creux ? Un message suffit.",
    line: "Tu écris à la bonne équipe, au bon moment.",
    Screen: MessageScreen,
  },
];

export function FeatureTour() {
  const sectionRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    let ticking = false;
    const update = () => {
      ticking = false;
      const el = sectionRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const scrollable = rect.height - window.innerHeight;
      const progress = scrollable > 0 ? Math.min(0.9999, Math.max(0, -rect.top / scrollable)) : 0;
      const next = Math.floor(progress * STEPS.length);
      setActive((cur) => (cur === next ? cur : next));
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  // Clic sur une étape (liste desktop, points mobile) : défile jusqu'à elle.
  const goTo = (i: number) => {
    const el = sectionRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const scrollable = el.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + (scrollable * (i + 0.5)) / STEPS.length, behavior: "smooth" });
  };

  return (
    <section
      id="fonctionnalites"
      ref={sectionRef}
      className="relative bg-paper-subtle scroll-mt-16"
      style={{ height: `${STEPS.length * 85 + 15}svh` }}
    >
      <div className="sticky top-16 h-[calc(100svh-4rem)] overflow-hidden">
        <div className="max-w-[1100px] h-full mx-auto px-5 sm:px-8 flex flex-col lg:grid lg:grid-cols-[1fr_auto] lg:gap-16 items-center justify-center">
          {/* Texte : un seul titre visible, les autres empilés dans la même case */}
          <div className="w-full text-center lg:text-left pt-4 lg:pt-0">
            <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-moss-dark mb-3 hidden lg:block">
              ▶ Ce que tu vois dans l&apos;app
            </p>
            <div className="grid">
              {STEPS.map((s, i) => (
                <div
                  key={s.id}
                  className="col-start-1 row-start-1 transition-[opacity,transform] duration-500 motion-reduce:transition-none"
                  style={{
                    opacity: i === active ? 1 : 0,
                    transform: i === active ? "none" : "translateY(8px)",
                  }}
                  aria-hidden={i !== active}
                >
                  <span className="inline-block font-mono text-[10px] tracking-[0.1em] uppercase text-moss-dark bg-moss-tint rounded-full px-2.5 py-1">
                    {s.who} · {s.plan}
                    {s.pilot && " · pilote"}
                  </span>
                  <h2 className="font-display text-[26px] sm:text-[34px] lg:text-[48px] leading-[1.1] tracking-[-0.02em] font-bold text-ink mt-3 mb-0 text-pretty">
                    {s.title}
                  </h2>
                  <p className="text-[15px] sm:text-base text-ink-muted mt-2 mb-0">{s.line}</p>
                </div>
              ))}
            </div>

            {/* Liste des étapes — desktop */}
            <ol className="hidden lg:flex flex-col gap-1 mt-10 p-0 list-none">
              {STEPS.map((s, i) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => goTo(i)}
                    className={`flex items-center gap-3 text-left text-[14px] py-1 transition-colors ${
                      i === active ? "text-ink font-semibold" : "text-ink-faint hover:text-ink-muted"
                    }`}
                  >
                    <span
                      className={`h-[3px] rounded-full transition-all duration-300 ${i === active ? "w-8 bg-moss" : "w-4 bg-paper-border"}`}
                    />
                    {s.title}
                  </button>
                </li>
              ))}
            </ol>
          </div>

          {/* Téléphone fixe, écrans en fondu */}
          <div className="flex flex-col items-center mt-5 lg:mt-0">
            <PhoneFrame
              className="w-[250px] sm:w-[290px]"
              screenClassName="h-[min(560px,calc(100svh-19rem))] lg:h-[560px]"
              statusTone={STEPS[active].lightStatus ? "light" : "dark"}
            >
              {STEPS.map((s, i) => (
                <div
                  key={s.id}
                  className="absolute inset-0 transition-opacity duration-500 motion-reduce:transition-none"
                  style={{ opacity: i === active ? 1 : 0 }}
                  aria-hidden={i !== active}
                >
                  <s.Screen />
                </div>
              ))}
            </PhoneFrame>

            {/* Points — mobile */}
            <div className="flex gap-2 mt-4 lg:hidden" role="tablist" aria-label="Fonctionnalités">
              {STEPS.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={i === active}
                  aria-label={s.title}
                  onClick={() => goTo(i)}
                  className={`h-2 rounded-full transition-all duration-300 ${i === active ? "w-6 bg-moss" : "w-2 bg-paper-border"}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
