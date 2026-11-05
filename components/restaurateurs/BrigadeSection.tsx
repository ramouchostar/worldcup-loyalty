"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import type { AssistantId } from "@/lib/agents/types";
import { PHOTOS } from "./IPhone";
import { BRIGADE, PLAN_LABEL, assistant } from "./brigade";

// « Votre brigade marketing » (Brigade 17, maquette du 2026-11-04, ADR 0089 §1),
// au style de la maquette : un onglet par assistant (portrait, poste), puis une
// fenêtre (carte pleine, charte anti-slop) sur une photo qui montre ce qu'il propose. Personnages fictifs.
// Vérité au 2026-11-05 (ADR 0070) : Nina et Max en pilote dans le Pro ; Louis
// montre sa réponse avant qu'elle parte (ADR 0089 : rien sans « Oui ») ; le site
// de Nina mesure les clics sur « Commander », jamais des commandes (ADR 0088).

const Bar = () => (
  <div className="bx-win-bar" aria-hidden>
    <i />
    <i />
    <i />
    <span>Exemple Boosteats</span>
  </div>
);

const Line = ({ k, v, warn = false }: { k: string; v: string; warn?: boolean }) => (
  <div className={`bx-line ${warn ? "bx-warn" : ""}`}>
    <span>{k}</span>
    <span>{v}</span>
  </div>
);

const Buttons = ({ no, yes }: { no: string; yes: string }) => (
  <div className="bx-wbtns" aria-hidden>
    <span>{no}</span>
    <span className="bx-y">{yes}</span>
  </div>
);

type Detail = { title: string; list: string[]; quote: string; bg: string; win: ReactNode };

const WEEK: [string, number, boolean?][] = [
  ["Lun", 62],
  ["Mar", 70],
  ["Mer", 66],
  ["Jeu", 38, true],
  ["Ven", 92],
  ["Sam", 100],
  ["Dim", 80],
];

const DETAILS: Record<AssistantId, Detail> = {
  lea: {
    title: "Elle fait revenir vos clients.",
    list: [
      "Le client prend son ticket de caisse en photo et gagne des points.",
      "Il choisit son cadeau, calculé sur ce qu'il vous coûte vraiment.",
      "Elle vous montre seulement les tickets douteux.",
    ],
    quote: "« Un client qui revient, c'est un client que je n'ai pas à aller chercher. »",
    bg: PHOTOS.clients,
    win: (
      <>
        <h4>Nouveau client inscrit</h4>
        <Line k="Ticket du jour" v="+ 280 points" />
        <Line k="Cadeau de bienvenue" v="Boisson offerte" />
        <Line k="Ce qu'il vous coûte" v="0,60 €" />
        <Line k="Ticket à vérifier" v="photo floue" warn />
        <Buttons no="Refuser" yes="Valider" />
      </>
    ),
  },
  hugo: {
    title: "Il écrit aux clients qui ne reviennent plus.",
    list: [
      "Il repère ceux qui ne sont pas passés depuis 3 semaines.",
      "Il prépare un message avec une bonne raison de revenir.",
      "Il l'envoie au bon moment, quand vous avez dit oui.",
    ],
    quote: "« Trois semaines sans nouvelles ? Je leur écris. »",
    bg: PHOTOS.salle,
    win: (
      <>
        <h4>340 clients à relancer</h4>
        <div className="bx-bubble">Ça fait un moment ! Mardi soir, la boisson est offerte avec votre menu. On vous garde une table ?</div>
        <Line k="Envoi" v="Mardi, 16 h" />
        <Line k="Coût maximum" v="40 € de boissons" />
        <Buttons no="Non" yes="Oui, envoyer" />
      </>
    ),
  },
  chloe: {
    title: "Elle vous dit ce qui marche et ce qui coûte.",
    list: [
      "Elle note votre chiffre d'affaires chaque jour.",
      "Elle calcule ce que vous coûte chaque plat.",
      "Elle repère vos jours calmes et prévient Hugo ou Emma.",
    ],
    quote: "« Le jeudi est calme ? Alors on s'occupe du jeudi. »",
    bg: PHOTOS.cuisine,
    win: (
      <>
        <h4>Votre semaine</h4>
        <div className="bx-bars" aria-hidden>
          {WEEK.map(([d, h, low]) => (
            <div key={d} className={low ? "bx-low" : ""}>
              <i style={{ height: `${h}%` }} />
              {d}
            </div>
          ))}
        </div>
        <Line k="Jour le plus calme" v="Jeudi" />
        <div className="bx-reply">
          <small>Idée de Chloé</small>Je demande à Hugo une promo pour jeudi soir ?
        </div>
        <Buttons no="Non" yes="Oui" />
      </>
    ),
  },
  emma: {
    title: "Elle fait connaître votre restaurant au quartier.",
    list: [
      "Elle prépare votre pub sur Facebook et Instagram.",
      "Elle la montre aux gens qui habitent autour de chez vous.",
      "Elle vous dit combien de personnes elle peut toucher, avant que vous payiez.",
    ],
    quote: "« Si le quartier ne vous connaît pas encore, je m'en occupe. »",
    bg: PHOTOS.poulet,
    win: (
      <>
        <div className="bx-adprev">
          <div className="bx-ah">
            <i />
            <div>
              Votre restaurant<span>Sponsorisé</span>
            </div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={PHOTOS.burger} alt="" loading="lazy" />
          <div className="bx-cta">
            <span>Family Bucket, ce week-end</span>
            <span>Itinéraire</span>
          </div>
        </div>
        <Line k="Zone" v="3 km autour de vous" />
        <Line k="Budget" v="14 € / jour, 2 semaines" />
        <Line k="Personnes touchées" v="8 000 à 12 000" />
        <Buttons no="Non" yes="Lancer la pub" />
      </>
    ),
  },
  louis: {
    title: "Il répond à vos avis Google.",
    list: [
      "Les bons comme les mauvais, poliment et vite.",
      "Une bonne réponse rassure ceux qui hésitent à venir.",
      "Il vous montre sa réponse avant qu'elle parte.",
    ],
    quote: "« Un avis sans réponse, c'est une porte fermée. »",
    bg: PHOTOS.salle,
    win: (
      <>
        <div className="bx-review">
          <b>Julien M.</b>
          <span className="bx-stars" aria-label="2 étoiles sur 5">★★☆☆☆</span>
          <span>Bon poulet, mais les frites étaient froides.</span>
        </div>
        <div className="bx-reply">
          <small>Réponse proposée par Louis</small>Merci Julien de nous l&apos;avoir dit. On a revu la cuisson des frites.
          Repassez nous voir, elles sont pour nous.
        </div>
        <Buttons no="Modifier" yes="Publier" />
      </>
    ),
  },
  nina: {
    title: "Elle crée un site qui donne envie de commander.",
    list: [
      "Elle crée votre site à partir de votre carte, de vos photos et de vos horaires.",
      "Tout est pensé pour une chose : que le client appuie sur « Commander ».",
      "« Commander » ouvre votre propre site de commande : pas de plateforme entre vous et le client.",
    ],
    quote: "« Chaque commande en direct, c'est une commission de moins. »",
    bg: PHOTOS.burger,
    win: (
      <>
        <div className="bx-site">
          <div className="bx-s-hero">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={PHOTOS.poulet} alt="" loading="lazy" />
            <div className="bx-s-over">
              <small>Ouvert jusqu&apos;à 23 h, 4,6 ★</small>
              <b>Le meilleur poulet frit du quartier</b>
              <span className="bx-s-cta">Commander</span>
            </div>
          </div>
          <div className="bx-s-promo">Family Bucket : la boisson offerte ce week-end</div>
        </div>
        <Line k="Clics sur « Commander » hier" v="14" />
        <Line k="Commission de plateforme" v="aucune" />
        <Buttons no="Voir le site" yes="Mettre en ligne" />
      </>
    ),
  },
  max: {
    title: "Il améliore votre visibilité sur Google.",
    list: [
      "Quand quelqu'un cherche « poulet frit près de moi », il fait apparaître votre restaurant.",
      "Il garde votre fiche Google propre et à jour : horaires, photos, carte.",
      "Chaque mois, il vous montre votre place sur Google Maps, quartier par quartier.",
    ],
    quote: "« Celui qui cherche à manger près de chez vous doit tomber sur vous. »",
    bg: PHOTOS.salle,
    win: (
      <>
        <div className="bx-maps">
          <div className="bx-q">poulet frit près de moi</div>
          <div className="bx-r bx-me">
            <span>1. Votre restaurant</span>
            <span>4,6 ★</span>
          </div>
          <div className="bx-r">
            <span>2. Le voisin</span>
            <span>4,2 ★</span>
          </div>
          <div className="bx-r">
            <span>3. Un autre</span>
            <span>3,9 ★</span>
          </div>
        </div>
        <Line k="Votre place ce mois-ci" v="de 3e à 1re" />
        <Line k="Les clics arrivent sur" v="votre site (Nina)" />
      </>
    ),
  },
};

export function BrigadeSection() {
  const [current, setCurrent] = useState(0);
  const a = BRIGADE[current];
  const d = DETAILS[a.id];
  const badge = a.pilot
    ? `En pilote, forfait ${PLAN_LABEL[a.plan]}`
    : a.plan === "gratuit"
      ? "Dès le forfait Gratuit"
      : `Forfait ${PLAN_LABEL[a.plan]} et plus`;

  return (
    <section id="brigade" className="bx-sec bx-x scroll-mt-16" style={{ paddingTop: 56 }}>
      <div className="bx-wrap">
        <div className="bx-brig-head">
          <div style={{ display: "grid", gap: 18 }}>
            <h2>Votre brigade marketing.</h2>
            <p className="bx-sub">
              Comme en cuisine, chacun son poste. Vous ne perdez pas de temps : vous validez et vous savez qui fait
              quoi.
            </p>
          </div>
        </div>

        <div className="bx-tabs" role="tablist" aria-label="Les membres de la brigade">
          {BRIGADE.map((b, i) => (
            <button
              key={b.id}
              type="button"
              role="tab"
              id={`bx-tab-${b.id}`}
              aria-selected={i === current}
              aria-controls="bx-panel"
              className="bx-tab"
              onClick={() => setCurrent(i)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={b.photo} alt="" loading="lazy" />
              <b>{b.name}</b>
              <span>
                {b.post}
                {b.pilot ? ", en pilote" : ""}
              </span>
            </button>
          ))}
        </div>

        <div className="bx-panel" id="bx-panel" role="tabpanel" aria-labelledby={`bx-tab-${a.id}`}>
          <div className="bx-p-text">
            <div className="bx-p-id">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.photo} alt="" />
              <div>
                <b>{a.name}</b>
                <span>{a.post}</span>
              </div>
            </div>
            <p className="bx-p-title">{d.title}</p>
            <ul className="bx-list">
              {d.list.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <p className="bx-quote">{d.quote}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
              <span className={`bx-badge ${a.pilot ? "bx-pilot" : ""}`}>{badge}</span>
              <Link href={assistant(a.id).href} className="bx-more-link">
                En savoir plus
              </Link>
            </div>
          </div>
          <div className="bx-p-vis">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="bx-bgimg" src={d.bg} alt="" aria-hidden loading="lazy" />
            <div className="bx-win bx-glass">
              <Bar />
              {d.win}
            </div>
          </div>
        </div>
        <p className="bx-credits" style={{ textAlign: "left" }}>
          Personnages fictifs, créés pour Boosteats. Nina et Max sont en pilote dans le forfait Pro, avec quelques
          établissements. Le nombre d&apos;assistants dépend du forfait.
        </p>
      </div>
    </section>
  );
}
