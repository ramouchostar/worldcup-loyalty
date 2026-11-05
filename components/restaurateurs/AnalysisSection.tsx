"use client";

import { TrackedLink } from "@/components/analytics/TrackedLink";
import { PHOTOS } from "./IPhone";
import { ChartColumn, Search, Smartphone, Star } from "@/components/icons";

// L'analyse gratuite (ADR 0071, maquette du 2026-11-04), au style de la
// maquette : quatre contrôles, puis un exemple de résultat (carte pleine) sur une photo
// de salle. Les quatre contrôles sont ceux de l'analyse réelle (fiche Google,
// avis, voisins à moins de 600 m — lib/audit/places.ts —, vitesse mobile).
// Résultat d'exemple : établissement IMAGINAIRE.
const CHECKS = [
  { q: "Est-ce qu'on vous trouve sur Google ?", a: "Horaires, photos, bouton pour commander.", Icon: Search },
  { q: "Que disent vos avis ?", a: "Votre note et les reproches qui reviennent.", Icon: Star },
  { q: "Êtes-vous devant vos voisins ?", a: "Comparé aux restaurants à moins de 600 m.", Icon: ChartColumn },
  { q: "Votre site marche-t-il sur téléphone ?", a: "Ce que voit vraiment un client, et la vitesse.", Icon: Smartphone },
];

const FIXES = [
  { title: "Ajouter vos horaires du dimanche", why: "Google affiche « horaires inconnus »" },
  { title: "Répondre aux 9 avis sans réponse", why: "dont 3 avis à 1 ou 2 étoiles" },
  { title: "Ajouter un lien pour commander", why: "vos 2 voisins mieux notés en ont un" },
];

export function AnalysisSection() {
  return (
    <section id="analyse" className="bx-sec bx-x scroll-mt-16">
      <div className="bx-wrap bx-audit">
        <div>
          <span className="bx-kicker">
            <b>Gratuit</b> analyse de votre restaurant
          </span>
          <h2 style={{ marginTop: 20 }}>Combien de clients perdez-vous avant même qu&apos;ils entrent ?</h2>
          <p className="bx-sub" style={{ marginTop: 18 }}>
            Avant de venir, vos clients regardent leur téléphone. L&apos;analyse vérifie ce qu&apos;ils y voient, et vous
            dit quoi corriger en premier.
          </p>
          <div className="bx-qs">
            {CHECKS.map((c) => (
              <div key={c.q} className="bx-qcard">
                <c.Icon className="bx-ic" size={24} />
                <b>{c.q}</b>
                <span>{c.a}</span>
              </div>
            ))}
          </div>
          <div className="bx-gets">
            <TrackedLink
              ctaId="audit_gratuit"
              ctaLocation="analyse"
              audience="restaurateur"
              href="/audit-gratuit"
              className="bx-btn bx-btn-ink bx-focus"
            >
              Analyser mon restaurant
            </TrackedLink>
            <p>
              Vous recevez une note sur 100, puis sur WhatsApp les 5 choses à corriger en premier. Vous pouvez les
              corriger vous-même.
            </p>
          </div>
        </div>
        <div className="bx-a-vis">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="bx-bgimg" src={PHOTOS.salle} alt="" aria-hidden loading="lazy" />
          <div className="bx-report bx-glass" role="img" aria-label="Exemple de résultat de l'analyse : 58 sur 100">
            <div className="bx-win-bar" aria-hidden>
              <i />
              <i />
              <i />
              <span>Exemple de résultat</span>
            </div>
            <div className="bx-score">
              <div className="bx-ring">
                {/* Score sur 100 : un cercle de rayon 40 fait 251,3 de tour. */}
                <svg viewBox="0 0 88 88" width="88" height="88" aria-hidden>
                  <circle cx="44" cy="44" r="40" fill="none" stroke="#E4E6DF" strokeWidth="8" />
                  <circle cx="44" cy="44" r="40" fill="none" stroke="#6B7C3F" strokeWidth="8" strokeDasharray={`${(58 / 100) * 251.3} 251.3`} />
                </svg>
                <div>58</div>
              </div>
              <div>
                <b style={{ fontSize: 20, fontWeight: 600 }}>Pizza Joe</b>
                <p style={{ fontSize: 15, color: "var(--bx-muted)", marginTop: 4 }}>4e sur 7 restaurants autour de vous</p>
              </div>
            </div>
            <ol className="bx-prio">
              {FIXES.map((f, i) => (
                <li key={f.title}>
                  <i>{i + 1}</i>
                  <span>
                    {f.title}
                    <em>{f.why}</em>
                  </span>
                </li>
              ))}
            </ol>
            <div className="bx-wa">Le rapport complet arrive sur WhatsApp</div>
          </div>
        </div>
      </div>
    </section>
  );
}
