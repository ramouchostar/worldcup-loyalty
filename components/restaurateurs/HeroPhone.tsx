"use client";

import { useEffect, useRef, useState } from "react";
import { IPhone, PHOTOS } from "./IPhone";
import { assistant } from "./brigade";

// Le téléphone du héros, animé (demande de Mehdi du 2026-11-05) : les idées
// arrivent sur l'écran verrouillé, on touche celle de Hugo, l'appli « Idées du
// jour » s'ouvre, on appuie sur « Oui », c'est validé, puis l'idée suivante.
//
// Légèreté : rien que du CSS (opacité et déplacements), aucune vidéo ni
// bibliothèque. L'animation ne tourne que si le téléphone est à l'écran et que
// l'onglet est visible ; « réduire les animations » montre l'écran verrouillé fixe.
// Notifications : Hugo, Emma, Chloé (livrés). Pas de Nina (site en pilote).

const NOTIFS = [
  { id: "hugo", tag: "Relances", when: "maint.", text: "340 clients ne sont pas revenus. Je leur offre une boisson mardi ?" },
  { id: "emma", tag: "Pub", when: "8 min", text: "Pub « Family Bucket » prête : 14 € par jour, à 3 km. On lance ?" },
  { id: "chloe", tag: "Chiffres", when: "1 h", text: "Le jeudi soir est votre soir le plus calme. Je demande une promo à Hugo ?" },
] as const;

// Étapes et durée de chacune (ms). La dernière reboucle sur la première.
const STEPS = [
  { name: "lock", ms: 2600 }, // les notifications arrivent
  { name: "tapNotif", ms: 700 }, // doigt sur celle de Hugo
  { name: "app", ms: 2300 }, // l'appli s'ouvre sur l'idée de Hugo
  { name: "tapYes", ms: 650 }, // doigt sur « Oui »
  { name: "done", ms: 3200 }, // validé, l'idée d'Emma arrive
] as const;
type Step = (typeof STEPS)[number]["name"];

export function HeroPhone() {
  const [i, setI] = useState(0);
  const [loop, setLoop] = useState(0);
  const [visible, setVisible] = useState(false);
  const [animate, setAnimate] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setAnimate(!reduce);
    if (reduce || !ref.current) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.2 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!animate || !visible) return;
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      t = setTimeout(() => {
        if (document.visibilityState === "visible") {
          const next = (i + 1) % STEPS.length;
          if (next === 0) setLoop((l) => l + 1);
          setI(next);
        }
        else tick();
      }, STEPS[i].ms);
    };
    tick();
    return () => clearTimeout(t);
  }, [i, visible, animate]);

  const step: Step = animate ? STEPS[i].name : "lock";
  const inApp = step === "app" || step === "tapYes" || step === "done";
  const hugo = assistant("hugo");
  const emma = assistant("emma");

  return (
    <div ref={ref} className="bx-hero-phone">
      <IPhone dark={!inApp} wallpaper={{ image: PHOTOS.fondEcran }} label="Exemple : une idée de la brigade arrive, le restaurateur l'ouvre et répond Oui">
        {/* Écran verrouillé */}
        <div key={loop} className={`bx-scr-in bx-layer ${inApp ? "bx-layer-off" : ""}`} aria-hidden={inApp}>
          <div className="bx-lock-time">
            <small>mardi 12 novembre</small>
            <b>9:41</b>
          </div>
          <div style={{ flex: 1 }} />
          {NOTIFS.map((n, k) => {
            const a = assistant(n.id);
            return (
              <div
                key={n.id}
                className={`bx-notif bx-glass bx-notif-in ${k === 0 && step === "tapNotif" ? "bx-pressed" : ""}`}
                style={animate ? { animationDelay: `${k * 380}ms` } : { animation: "none" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.photo} alt="" />
                <div style={{ minWidth: 0 }}>
                  <div className="bx-h">
                    <em>
                      {a.name} · {n.tag}
                    </em>
                    <span>{n.when}</span>
                  </div>
                  <p>{n.text}</p>
                </div>
                {k === 0 && step === "tapNotif" && <span className="bx-tap" />}
              </div>
            );
          })}
        </div>

        {/* Appli « Idées du jour » */}
        <div className={`bx-scr-in bx-layer bx-app ${inApp ? "" : "bx-layer-off bx-app-closed"}`} aria-hidden={!inApp}>
          <div className="bx-app-head">
            <div>
              <small>Mardi 12 novembre</small>
              <b>Idées du jour</b>
            </div>
            <span className="bx-pill">{step === "done" ? "2 à valider" : "3 à valider"}</span>
          </div>
          {step === "done" && (
            <div className="bx-done bx-glass bx-pop">
              <i aria-hidden>✓</i>Oui · Hugo envoie mardi à 16 h
            </div>
          )}
          <div className={`bx-card bx-glass ${step === "done" ? "bx-swap" : ""}`} key={step === "done" ? "emma" : "hugo"}>
            <div className="bx-whom">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={(step === "done" ? emma : hugo).photo} alt="" />
              <div>
                <b>{(step === "done" ? emma : hugo).name}</b>
                <span>{(step === "done" ? emma : hugo).post}</span>
              </div>
            </div>
            <p>
              {step === "done"
                ? "Pub « Family Bucket » à 3 km, 14 € par jour pendant 2 semaines."
                : "340 clients ne sont pas revenus depuis 3 semaines. Je leur offre une boisson mardi soir ?"}
            </p>
            <span className="bx-meta">{step === "done" ? "8 000 à 12 000 personnes touchées · exemple" : "Coût maximum : 40 € · exemple"}</span>
            <div className="bx-yn">
              <span className="bx-no">Non</span>
              <span className={`bx-yes ${step === "tapYes" ? "bx-pressed" : ""}`}>
                Oui
                {step === "tapYes" && <span className="bx-tap" />}
              </span>
            </div>
          </div>
          <small style={{ fontSize: 11.5, fontWeight: 700, opacity: 0.6, padding: "6px 6px 0" }}>ENSUITE</small>
          <div className="bx-done bx-glass" style={{ opacity: 0.85 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={assistant("chloe").photo} alt="" />
            Chloé · Suit les chiffres
          </div>
        </div>
      </IPhone>
    </div>
  );
}
