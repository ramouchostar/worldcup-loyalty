"use client";

import { RestaurantSearchBar } from "@/components/audit-gratuit/RestaurantSearchBar";
import { IPhone, PHOTOS } from "./IPhone";
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
// Notifications : Hugo, Emma, Chloé (livrés). Pas de Nina ici : son site est en
// pilote et Boosteats ne compte pas de commandes (ADR 0088), seulement des clics.
const FACES = ["lea", "hugo", "chloe", "emma"] as const;

const NOTIFS = [
  { id: "hugo", tag: "Relances", when: "maint.", text: "340 clients ne sont pas revenus. Je leur offre une boisson mardi ?" },
  { id: "emma", tag: "Pub", when: "8 min", text: "Pub « Family Bucket » prête : 14 € par jour, à 3 km. On lance ?" },
  { id: "chloe", tag: "Chiffres", when: "1 h", text: "Le jeudi soir est votre soir le plus calme. Je demande une promo à Hugo ?" },
] as const;

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
          {/* Comment + quoi */}
          <p className="bx-sub">
            Chaque jour, une brigade de <b style={{ color: "var(--bx-ink)" }}>7 agents IA</b> épluche vos ventes, vos
            clients et votre quartier, puis vous propose les actions qui font vendre.{" "}
            <b style={{ color: "var(--bx-ink)" }}>De vrais experts la pilotent</b>{" "}
            et passent à l&apos;action avec vous.
            Vous dites « Oui », c&apos;est lancé.
          </p>
          {/* Qui */}
          <p className="bx-who">
            Pour les restaurateurs aguerris qui ont touché un plafond et sont prêts à tout donner pour le dépasser.
          </p>
          {/* Premier pas : l'analyse gratuite (ADR 0071) */}
          <p className="bx-step1">Première étape : l&apos;analyse gratuite de votre restaurant</p>
          <div className="bx-search">
            <RestaurantSearchBar location="hero" />
          </div>
          <p className="bx-hint">
            Votre note sur 100 en moins d&apos;une minute · ce qui vous coûte des clients sur Google · sans engagement
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
            <img src={PHOTOS.restaurateur} alt="Un restaurateur dans sa salle" fetchPriority="high" />
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
          <IPhone dark wallpaper={{ image: PHOTOS.fondEcran }} label="Exemple : les idées de la brigade arrivent sur le téléphone du restaurateur">
            <div className="bx-scr-in">
              <div className="bx-lock-time">
                <small>mardi 12 novembre</small>
                <b>9:41</b>
              </div>
              <div style={{ flex: 1 }} />
              {NOTIFS.map((n) => {
                const a = assistant(n.id);
                return (
                  <div key={n.id} className="bx-notif bx-glass">
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
                  </div>
                );
              })}
            </div>
          </IPhone>
        </div>
      </div>
    </section>
  );
}
