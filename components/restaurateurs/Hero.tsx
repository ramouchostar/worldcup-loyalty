"use client";

import { RestaurantSearchBar } from "@/components/audit-gratuit/RestaurantSearchBar";
import { PHOTOS } from "./IPhone";
import { HeroPhone } from "./HeroPhone";
import { assistant } from "./brigade";

// Héros (Brigade 17, maquette validée le 2026-11-04, ADR 0089 ; style de la
// maquette : photo du restaurateur, iPhone vitré, notifications de la brigade).
//
// Titre (2026-11-05, Mehdi) : structure promesse → comment → quoi → qui, puis
// l'analyse gratuite comme premier pas. « agents IA » autorisé ICI seulement
// (décision de Mehdi, test `lib/marketing-pages.test.ts`) ; partout ailleurs la
// brigade reste des « assistants ». Jamais « 24 h/24 » : les idées arrivent
// chaque matin (cron 9 h), d'où « 7 j/7 ».
//
// Texte raccourci et photo de salle pleine (Mehdi, 2026-11-05). Le téléphone
// animé est dans HeroPhone.tsx.
const FACES = ["lea", "hugo", "chloe", "emma"] as const;


export function Hero() {
  return (
    <section className="bx-hero bx-x">
      <div className="bx-wrap bx-hero-grid">
        <div className="bx-hero-copy">
          <span className="bx-kicker">
            <b>Nouveau</b> Votre brigade marketing, 7 j/7
          </span>
          {/* Promesse */}
          <h1>
            Faites grimper votre <em>chiffre d&apos;affaires</em>.
          </h1>
          {/* Comment + quoi (raccourci le 2026-11-05 : une phrase, puis les experts) */}
          <p className="bx-sub">
            <b style={{ color: "var(--bx-ink)" }}>7 agents IA</b> analysent vos ventes et vos clients, et vous proposent
            chaque jour les actions qui font vendre. <b style={{ color: "var(--bx-ink)" }}>De vrais experts vous accompagnent.</b>
          </p>
          {/* Qui */}
          <p className="bx-who">Pour les restaurateurs ambitieux, prêts à passer un cap.</p>
          {/* Premier pas : l'analyse gratuite (ADR 0071) */}
          <p className="bx-step1">Première étape : l&apos;analyse gratuite de votre restaurant</p>
          <div className="bx-search">
            <RestaurantSearchBar location="hero" />
          </div>
          <p className="bx-hint">
            En 1 minute, un aperçu gratuit : comment vous vous situez face aux restaurants autour de vous sur Google, et ce
            qu&apos;il faut corriger en premier.
          </p>
          <div className="bx-crew">
            <div className="bx-faces" aria-hidden>
              {FACES.map((id) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={id} src={assistant(id).photo} alt="" />
              ))}
              <span className="bx-more">+3</span>
            </div>
            <span>
              <b>Léa, Hugo, Chloé, Emma et 3 autres</b>
              <br />
              votre brigade, pilotée par notre équipe
            </span>
          </div>
        </div>

        <div className="bx-stage">
          <div className="bx-photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={PHOTOS.sallePleine} alt="Une salle de restaurant pleine, le soir" fetchPriority="high" />
          </div>
          <div className="bx-chips" aria-hidden>
            <div className="bx-chip bx-glass">
              <span className="bx-dot" />
              <span>
                <b>3 idées</b>
                <br />à valider ce matin
              </span>
            </div>
            <div className="bx-chip bx-glass-dark">
              <span>
                <b>5 min</b>
                <br />
                par jour, pas plus
              </span>
            </div>
          </div>
          <HeroPhone />
        </div>
      </div>
    </section>
  );
}
