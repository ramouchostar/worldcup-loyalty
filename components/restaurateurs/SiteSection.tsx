"use client";

import type { AssistantId } from "@/lib/agents/types";
import { IPhone, PHOTOS } from "./IPhone";
import { assistant } from "./brigade";
import { ArrowRight, Check } from "@/components/icons";

// Le site de Nina (Brigade 17, maquette du 2026-11-04 ; ADR 0088), au style de
// la maquette : la brigade qui envoie les clients, puis un iPhone posé sur une
// photo. EN PILOTE (ADR 0070 : jamais au présent comme disponible).
// Écarts voulus à la maquette :
// - « Commander » ouvre la commande que l'établissement utilise déjà : tant que la
//   commande du site de Nina est fermée (ADR 0099 §8, SITE_ORDER_RESTAURANTS),
//   Boosteats ne prend pas de commande, donc pas de « Nouvelle commande en
//   direct » ; la bulle dit ce que fait le bouton. À revoir le jour où elle s'ouvre ;
// - la commission des plateformes s'écrit « jusqu'à 30 % selon le contrat »,
//   sans exemple chiffré (décision du 2026-11-05).
const SENDERS: { id: AssistantId; text: string }[] = [
  { id: "max", text: "envoie ceux qui vous cherchent sur Google" },
  { id: "emma", text: "envoie ceux qui voient votre pub" },
  { id: "hugo", text: "envoie vos clients fidèles" },
];

export function SiteSection() {
  return (
    <section id="site" className="bx-sec bx-x scroll-mt-16" style={{ paddingTop: 0 }}>
      <div className="bx-wrap bx-direct">
        <div>
          <span className="bx-kicker">
            <b>Nina, en pilote</b> votre site internet
          </span>
          <h2 style={{ marginTop: 20 }}>Vos clients commandent chez vous. Pas chez Uber Eats.</h2>
          <p className="bx-sub" style={{ marginTop: 18 }}>
            Nina crée votre site, pensé pour Google et pour donner envie de commander, à partir de votre carte, de vos photos et de
            vos horaires. C&apos;est là que toute la brigade envoie les clients.
          </p>
          <ul className="bx-feeds" style={{ listStyle: "none", padding: 0 }}>
            {SENDERS.map((s) => {
              const a = assistant(s.id);
              return (
                <li key={s.id} className="bx-feed">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.photo} alt="" loading="lazy" />
                  <div>
                    <b>
                      {a.name}
                      {a.pilot ? " (en pilote)" : ""}
                    </b>
                    <span>{s.text}</span>
                  </div>
                  <em aria-hidden><ArrowRight size={20} /></em>
                </li>
              );
            })}
            <li className="bx-feed bx-to">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={assistant("nina").photo} alt="" loading="lazy" />
              <div>
                <b>Votre site, par Nina</b>
                <span>le client appuie sur « Commander » et arrive sur votre site de commande</span>
              </div>
              <em aria-hidden><Check size={20} /></em>
            </li>
          </ul>
          <div className="bx-compare">
            <div className="bx-cmp bx-plat">
              <small>Commande via une plateforme</small>
              <b>jusqu&apos;à 30 %</b>
              <span>de commission, selon votre contrat</span>
            </div>
            <div className="bx-cmp bx-dir">
              <small>La même commande en direct</small>
              <b>0 %</b>
              <span>de commission de plateforme : tout reste pour vous</span>
            </div>
          </div>
          <p className="bx-muted" style={{ fontSize: 13.5, marginTop: 16 }}>
            Dans le forfait Pro, avec quelques établissements pilotes pour commencer.
          </p>
        </div>

        <div className="bx-d-vis">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="bx-bgimg" src={PHOTOS.burger} alt="" aria-hidden loading="lazy" />
          <div className="bx-toast bx-glass" aria-hidden>
            <span className="bx-dot" />
            <span>
              <b>« Commander »</b>ouvre votre site de commande
            </span>
          </div>
          <IPhone width={290} lightStatus label="Exemple de site créé par Nina, sur téléphone">
            <div className="bx-phone-site">
              <div className="bx-ps-hero">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={PHOTOS.poulet} alt="" loading="lazy" />
                <div className="bx-s-over" style={{ paddingTop: 60 }}>
                  <small>Ouvert jusqu&apos;à 23 h, 4,6 ★ (156 avis)</small>
                  <b style={{ fontSize: 24 }}>Le meilleur poulet frit du quartier</b>
                </div>
              </div>
              <div className="bx-ps-body">
                <div className="bx-s-promo" style={{ borderRadius: 8 }}>
                  Ce week-end : la boisson offerte avec le Family Bucket
                </div>
                <div className="bx-ps-item">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={PHOTOS.burger} alt="" loading="lazy" />
                  <div>
                    <b>Burger maison</b>
                    <span>Frites et boisson</span>
                  </div>
                  <strong>11,90 €</strong>
                </div>
                <div className="bx-ps-item">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={PHOTOS.poulet} alt="" loading="lazy" />
                  <div>
                    <b>Family Bucket</b>
                    <span>12 pièces, 4 frites</span>
                  </div>
                  <strong>15,90 €</strong>
                </div>
              </div>
              <div className="bx-ps-cta">
                <span>Commander</span>
                <small>Appeler ou itinéraire</small>
              </div>
            </div>
          </IPhone>
        </div>
      </div>
    </section>
  );
}
