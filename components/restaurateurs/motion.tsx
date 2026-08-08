"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

// Utilitaires d'animation de la landing publique restaurateurs (redesign
// m55, design Claude "Landing Restaurateurs"). Pas de librairie externe :
// IntersectionObserver + transitions CSS suffisent pour un scroll dynamique
// tout en gardant la page légère (contrainte "fluide et rapide à charger").

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

// Fait apparaître son contenu (fondu + léger déplacement) quand il entre
// dans le viewport. Se déclenche une seule fois — pas de va-et-vient en
// scrollant vers le haut, pour rester sobre.
export function Reveal({
  children,
  delay = 0,
  y = 18,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  as?: "div" | "li";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) {
      setVisible(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

  const style: CSSProperties = {
    opacity: visible ? 1 : 0,
    transform: visible ? "translateY(0)" : `translateY(${y}px)`,
    transitionProperty: "opacity, transform",
    transitionDuration: "700ms",
    transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
    transitionDelay: `${delay}ms`,
    willChange: "opacity, transform",
  };

  const Comp = Tag as "div";
  return (
    <Comp ref={ref} className={className} style={style}>
      {children}
    </Comp>
  );
}

// Anime un nombre de 0 à `value` lorsqu'il entre dans le viewport.
export function CountUp({
  value,
  duration = 900,
  decimals = 0,
  prefix = "",
  suffix = "",
  className,
}: {
  value: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(0);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) {
      setDisplay(value);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const progress = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - progress, 3);
          setDisplay(value * eased);
          if (progress < 1) requestAnimationFrame(tick);
          else setDisplay(value);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [value, duration, reduced]);

  const formatted =
    decimals > 0
      ? display.toFixed(decimals)
      : Math.round(display).toLocaleString("fr-BE");

  return (
    <span ref={ref} className={className}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}

// Barre de progression qui se remplit de 0 à `percent` à l'entrée dans le
// viewport (utilisée pour le score d'équipe du mockup téléphone).
export function FillBar({
  percent,
  className,
  trackClassName,
}: {
  percent: number;
  className?: string;
  trackClassName?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [filled, setFilled] = useState(false);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) {
      setFilled(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setFilled(true);
          io.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

  return (
    <div ref={ref} className={trackClassName}>
      <div
        className={className}
        style={{
          width: filled ? `${percent}%` : "0%",
          transition: "width 1100ms cubic-bezier(0.16, 1, 0.3, 1) 150ms",
        }}
      />
    </div>
  );
}

// Barre verticale (graphique) qui grandit de 0 à `heightPx` à l'entrée dans
// le viewport, avec un délai optionnel pour un effet en cascade.
export function GrowBar({
  heightPx,
  delay = 0,
  className,
}: {
  heightPx: number;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [grown, setGrown] = useState(false);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) {
      setGrown(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setGrown(true);
          io.disconnect();
        }
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        height: grown ? heightPx : 0,
        transition: `height 700ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
      }}
    />
  );
}

// true dès que la page a défilé au-delà de `threshold` — pilote l'entête
// sticky (fond plus opaque, ombre) sans re-render à chaque pixel scrollé.
export function useScrolled(threshold = 8) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return scrolled;
}

// Fine barre de progression de lecture, fixée sous l'entête. Mutation DOM
// directe via ref (pas de setState par scroll) pour rester fluide à 60fps.
export function ScrollProgressBar() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let ticking = false;
    const update = () => {
      ticking = false;
      const el = ref.current;
      if (!el) return;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      el.style.transform = `scaleX(${progress})`;
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

  return (
    <div className="fixed top-0 left-0 right-0 h-[2px] z-[60] pointer-events-none">
      <div
        ref={ref}
        className="h-full w-full origin-left bg-moss-light"
        style={{ transform: "scaleX(0)" }}
      />
    </div>
  );
}

// Léger parallaxe vertical (élément qui se déplace plus lentement que le
// scroll) — utilisé pour le halo radial du hero. Mutation DOM directe pour
// rester à 60fps, désactivé si prefers-reduced-motion.
export function useParallaxOffset(speed: number) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const el = ref.current;
    if (!el) return;
    let ticking = false;
    const update = () => {
      ticking = false;
      el.style.transform = `translate3d(0, ${window.scrollY * speed}px, 0)`;
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [speed, reduced]);

  return ref;
}
