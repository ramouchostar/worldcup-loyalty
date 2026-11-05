"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { IPhone } from "./IPhone";
import { assistant } from "./brigade";
import { Check } from "@/components/icons";

// Le téléphone du héros, animé (demande de Mehdi du 2026-11-05, refaite le même
// jour pour la qualité) : les idées arrivent une à une sur l'écran verrouillé, la
// plus récente en haut comme sur iOS ; un doigt touche celle de Hugo, l'appli
// « Idées du jour » s'ouvre en zoomant depuis la notification ; le doigt appuie
// sur « Oui », le bouton devient « Validé », la carte se replie et l'idée d'Emma
// prend sa place ; l'appli se referme vers la notification, et ça recommence.
//
// Légèreté : rien que du CSS (transform, opacity, grid-template-rows), aucune
// vidéo ni bibliothèque. L'animation ne tourne que si le téléphone est à l'écran
// et que l'onglet est visible ; « réduire les animations » montre l'écran
// verrouillé fixe, les trois idées arrivées. Pas de Nina (site en pilote).

type NotifId = "hugo" | "emma" | "chloe";

const NOTIFS: Record<NotifId, { tag: string; when: string; text: string }> = {
  hugo: { tag: "relances", when: "maint.", text: "340 clients ne sont pas revenus. Je leur offre une boisson mardi ?" },
  emma: { tag: "pub", when: "8 min", text: "Pub « Family Bucket » prête : 14 € par jour, à 3 km. On lance ?" },
  chloe: { tag: "chiffres", when: "1 h", text: "Le jeudi soir est votre soir le plus calme. Je demande une promo à Hugo ?" },
};
// Ordre d'empilement : la plus récente en haut.
const STACK: NotifId[] = ["hugo", "emma", "chloe"];

// Chaque étape et sa durée (ms). La dernière reboucle sur la première.
const STEPS = [
  { name: "empty", ms: 700 }, // écran verrouillé vide
  { name: "n1", ms: 650 }, // Chloé arrive
  { name: "n2", ms: 650 }, // Emma arrive, Chloé descend
  { name: "n3", ms: 1300 }, // Hugo arrive en haut
  { name: "aim", ms: 650 }, // le doigt va sur la notification de Hugo
  { name: "tap", ms: 220 }, // appui
  { name: "open", ms: 650 }, // l'appli s'ouvre depuis la notification
  { name: "read", ms: 1400 }, // on lit l'idée
  { name: "aimYes", ms: 650 }, // le doigt va sur « Oui »
  { name: "tapYes", ms: 220 }, // appui
  { name: "yes", ms: 750 }, // « Validé »
  { name: "next", ms: 2600 }, // la carte se replie, l'idée d'Emma arrive
  { name: "close", ms: 750 }, // l'appli se referme
] as const;
type Step = (typeof STEPS)[number]["name"];
const at = (s: Step) => STEPS.findIndex((x) => x.name === s);
const ARRIVAL: Record<NotifId, number> = { chloe: at("n1"), emma: at("n2"), hugo: at("n3") };
const STATIC_STEP = at("n3");

const GAP = 8;
type Point = { x: number; y: number };

export function HeroPhone() {
  const [i, setI] = useState(STATIC_STEP);
  const [wait, setWait] = useState(0);
  const [visible, setVisible] = useState(false);
  const [animate, setAnimate] = useState(false);
  const [heights, setHeights] = useState<Record<NotifId, number>>({ hugo: 92, emma: 92, chloe: 92 });
  const [stackTop, setStackTop] = useState(200);
  const [stageWidth, setStageWidth] = useState(266);
  const [yesAt, setYesAt] = useState<Point>({ x: 190, y: 330 });

  const ref = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const stack = useRef<HTMLDivElement>(null);
  const notifRefs = useRef<Partial<Record<NotifId, HTMLDivElement | null>>>({});
  const yesRef = useRef<HTMLSpanElement>(null);

  // Démarre seulement à l'écran, jamais avec « réduire les animations ».
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !ref.current) return;
    setAnimate(true);
    setI(0);
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.2 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!animate || !visible) return;
    const t = setTimeout(() => {
      // Onglet caché : on n'avance pas, on réessaie plus tard.
      if (document.visibilityState === "visible") setI((n) => (n + 1) % STEPS.length);
      else setWait((w) => w + 1);
    }, STEPS[i].ms);
    return () => clearTimeout(t);
  }, [i, wait, visible, animate]);

  // Mesures réelles (hauteur de chaque notification, position du bouton « Oui »)
  // pour que l'empilement et le doigt tombent juste, quelle que soit la largeur.
  useLayoutEffect(() => {
    const measure = () => {
      const h = {} as Record<NotifId, number>;
      for (const id of STACK) h[id] = notifRefs.current[id]?.offsetHeight ?? 92;
      setHeights(h);
      if (stack.current) setStackTop(stack.current.offsetTop);
      if (stage.current) setStageWidth(stage.current.offsetWidth);
      if (yesRef.current) {
        // Position dans l'appli à l'échelle 1, mesurée sans les transformations.
        let x = yesRef.current.offsetWidth / 2;
        let y = yesRef.current.offsetHeight / 2;
        let el: HTMLElement | null = yesRef.current;
        while (el && el !== stage.current) {
          x += el.offsetLeft;
          y += el.offsetTop;
          el = el.offsetParent as HTMLElement | null;
        }
        setYesAt({ x, y });
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const step = STEPS[i].name;
  const past = (s: Step) => i >= at(s);
  const inApp = past("open") && !past("close");
  const nextDone = past("next");

  // Empilement : position de chaque notification arrivée, la plus récente en haut.
  const arrived = (id: NotifId) => i >= ARRIVAL[id] && !past("open");
  const shown = STACK.filter(arrived);
  const offsetOf = (id: NotifId) => {
    let y = 0;
    for (const other of shown) {
      if (other === id) break;
      y += heights[other] + GAP;
    }
    return y;
  };

  // Centre de la notification de Hugo (toujours en haut quand on la touche) :
  // origine du zoom de l'appli et cible du doigt.
  const hugoAt: Point = { x: stageWidth / 2, y: stackTop + heights.hugo / 2 };

  const finger: { p: Point; on: boolean; down: boolean } =
    step === "aim" || step === "tap"
      ? { p: hugoAt, on: true, down: step === "tap" }
      : step === "aimYes" || step === "tapYes"
        ? { p: yesAt, on: true, down: step === "tapYes" }
        : step === "open" || step === "read"
          ? { p: hugoAt, on: false, down: false }
          : step === "yes"
            ? { p: yesAt, on: false, down: false }
            : { p: { x: stageWidth * 0.72, y: stackTop + 360 }, on: false, down: false };

  const hugo = assistant("hugo");
  const emma = assistant("emma");
  const chloe = assistant("chloe");

  return (
    <div ref={ref} className="bx-hero-phone">
      <IPhone
        dark={!inApp}
        wallpaper={{ background: "#18200f" }}
        label="Exemple : une idée de la brigade arrive, le restaurateur l'ouvre et répond Oui"
      >
        <div ref={stage} className="bx-hp-stage" aria-hidden>
          {/* Écran verrouillé */}
          <div className={`bx-hp-lock ${inApp ? "bx-hp-away" : ""}`}>
            <div className="bx-lock-time">
              <small>mardi 12 novembre</small>
              <b>9:41</b>
            </div>
            <div ref={stack} className="bx-hp-stack">
              {STACK.map((id) => {
                const n = NOTIFS[id];
                const a = assistant(id);
                const on = arrived(id);
                const style: CSSProperties = {
                  transform: on
                    ? `translateY(${offsetOf(id)}px) scale(${id === "hugo" && step === "tap" ? 0.96 : 1})`
                    : "translateY(-28px) scale(0.94)",
                  opacity: on ? 1 : 0,
                  // La plus récente passe par-dessus celles qu'elle pousse.
                  zIndex: STACK.length - STACK.indexOf(id),
                };
                return (
                  <div
                    key={id}
                    ref={(el) => {
                      notifRefs.current[id] = el;
                    }}
                    className="bx-notif bx-glass bx-hp-notif"
                    style={style}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.photo} alt="" />
                    <div style={{ minWidth: 0 }}>
                      <div className="bx-h">
                        <em>
                          {a.name}, {n.tag}
                        </em>
                        <span>{n.when}</span>
                      </div>
                      <p>{n.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Appli « Idées du jour », qui s'ouvre depuis la notification de Hugo */}
          <div
            className={`bx-hp-app ${inApp ? "bx-hp-open" : ""}`}
            style={{ transformOrigin: `${hugoAt.x}px ${hugoAt.y}px` }}
          >
            <div className="bx-app-head">
              <div>
                <small>Mardi 12 novembre</small>
                <b>Idées du jour</b>
              </div>
              <span className="bx-pill bx-hp-count">
                <span key={nextDone ? 2 : 3} className="bx-hp-roll">
                  {nextDone ? 2 : 3}
                </span>
                &nbsp;à valider
              </span>
            </div>

            <Collapse open={nextDone}>
              <div className="bx-done bx-glass">
                <i>
                  <Check size={14} />
                </i>
                Oui. Hugo envoie mardi à 16 h
              </div>
            </Collapse>

            <Collapse open={!nextDone}>
              <div className="bx-card bx-glass">
                <div className="bx-whom">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={hugo.photo} alt="" />
                  <div>
                    <b>{hugo.name}</b>
                    <span>{hugo.post}</span>
                  </div>
                </div>
                <p>340 clients ne sont pas revenus depuis 3 semaines. Je leur offre une boisson mardi soir ?</p>
                <span className="bx-meta">Coût maximum : 40 € (exemple)</span>
                <div className="bx-yn">
                  <span className="bx-no">Non</span>
                  <span
                    ref={yesRef}
                    className={`bx-yes bx-hp-yes ${step === "tapYes" ? "bx-hp-down" : ""} ${past("yes") ? "bx-hp-done" : ""}`}
                  >
                    <span className="bx-hp-yes-label">Oui</span>
                    <span className="bx-hp-yes-ok">
                      <Check size={16} />
                      Validé
                    </span>
                  </span>
                </div>
              </div>
            </Collapse>

            <Collapse open={nextDone} delay={140}>
              <div className="bx-card bx-glass">
                <div className="bx-whom">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={emma.photo} alt="" />
                  <div>
                    <b>{emma.name}</b>
                    <span>{emma.post}</span>
                  </div>
                </div>
                <p>Pub « Family Bucket » à 3 km, 14 € par jour pendant 2 semaines.</p>
                <span className="bx-meta">8 000 à 12 000 personnes touchées (exemple)</span>
                <div className="bx-yn">
                  <span className="bx-no">Non</span>
                  <span className="bx-yes">Oui</span>
                </div>
              </div>
            </Collapse>

            <small className="bx-next">Ensuite</small>
            <Collapse open={!nextDone}>
              <div className="bx-done bx-glass">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={emma.photo} alt="" />
                Emma, publicités en ligne
              </div>
            </Collapse>
            <Collapse open>
              <div className="bx-done bx-glass">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={chloe.photo} alt="" />
                Chloé, suit les chiffres
              </div>
            </Collapse>
          </div>

          {/* Le doigt */}
          <span
            className={`bx-hp-finger ${finger.on ? "bx-hp-on" : ""} ${finger.down ? "bx-hp-press" : ""}`}
            style={{ transform: `translate(${finger.p.x - 20}px, ${finger.p.y - 20}px)` }}
          />
        </div>
      </IPhone>
    </div>
  );
}

// Bloc qui se déplie ou se replie en hauteur (grid-template-rows 0fr ↔ 1fr).
function Collapse({ open, delay = 0, children }: { open: boolean; delay?: number; children: ReactNode }) {
  return (
    <div className="bx-hp-col" data-open={open} style={{ transitionDelay: open ? `${delay}ms` : "0ms" }}>
      <div>{children}</div>
    </div>
  );
}
