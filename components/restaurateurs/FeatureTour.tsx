"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { ChevronDown } from "lucide-react";
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
// l'écran qui explique. Le badge dit QUI voit l'écran (côté client / côté
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
  who: "Côté client" | "Côté console";
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
    who: "Côté client",
    title: "Chaque ticket rapporte des points.",
    line: "Le client revient chercher son cadeau, au coût maîtrisé.",
    Screen: LoyaltyScreen,
    lightStatus: true,
  },
  {
    id: "equipes",
    plan: "Gratuit",
    who: "Côté client",
    title: "Les clients viennent en équipe.",
    line: "Bureau, école, salle de sport : chaque équipe recrute pour l'établissement.",
    Screen: TeamScreen,
    lightStatus: true,
  },
  {
    id: "commande",
    pilot: true,
    plan: "Croissance",
    who: "Côté client",
    title: "Un site de commande à son nom.",
    line: "À emporter, payé directement sur le compte de l'établissement. Sans plateforme.",
    Screen: OrderSiteScreen,
  },
  {
    id: "sources",
    pilot: true,
    plan: "Croissance",
    who: "Côté console",
    title: "Ce que rapporte chaque pub, enfin chiffré.",
    line: "Chaque commande dit d'où elle vient.",
    Screen: SourcesScreen,
  },
  {
    id: "google",
    pilot: true,
    plan: "Pro",
    who: "Côté console",
    title: "Plus haut sur Google.",
    line: "Le référencement est pris en charge, la place suivie chaque mois.",
    Screen: GoogleScreen,
  },
  {
    id: "annonces",
    plan: "Gratuit",
    who: "Côté console",
    title: "Un mardi creux ? Un message suffit.",
    line: "Le bon message à la bonne équipe, au bon moment.",
    Screen: MessageScreen,
  },
];

// Taille de conception du téléphone (proportions d'un vrai iPhone). Il est
// réduit EN ENTIER (scale) pour tenir dans la hauteur disponible — jamais
// écrasé en hauteur seule, sinon il ressemble à une montre.
const PHONE_W = 290;
const PHONE_H = 620;

export function FeatureTour() {
  const sectionRef = useRef<HTMLElement>(null);
  const phoneAreaRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = phoneAreaRef.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, Math.max(0.5, (el.clientHeight - 8) / PHONE_H)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
              ▶ Ce que montre l&apos;app
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

          {/* Téléphone fixe (réduit en entier), écrans en fondu */}
          <div ref={phoneAreaRef} className="relative w-full flex-1 min-h-0 mt-4 mb-3 lg:m-0 lg:w-[340px] lg:h-full lg:flex-none">
            <div
              className="absolute left-1/2 top-1/2"
              style={{ width: PHONE_W, transform: `translate(-50%, -50%) scale(${scale})` }}
            >
              <PhoneFrame
                className="w-[290px]"
                screenClassName="h-[600px]"
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
            </div>

            {/* Repères verticaux — mobile : on comprend qu'il faut défiler vers le bas */}
            <div
              className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 lg:hidden"
              style={{ left: `calc(50% + ${(PHONE_W / 2) * scale + 14}px)` }}
              role="tablist"
              aria-orientation="vertical"
              aria-label="Fonctionnalités"
            >
              {STEPS.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={i === active}
                  aria-label={s.title}
                  onClick={() => goTo(i)}
                  className={`w-2 rounded-full transition-all duration-300 ${i === active ? "h-6 bg-moss" : "h-2 bg-ink/20"}`}
                />
              ))}
              <ChevronDown
                className={`w-4 h-4 mt-1 text-moss-dark motion-safe:animate-bounce transition-opacity ${active === STEPS.length - 1 ? "opacity-0" : "opacity-100"}`}
                aria-hidden
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
