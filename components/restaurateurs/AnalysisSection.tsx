"use client";

import { TrackedLink } from "@/components/analytics/TrackedLink";
import { PHOTOS } from "./IPhone";

// L'analyse gratuite (ADR 0071, maquette du 2026-11-04), au style de la
// maquette : quatre contrôles, puis un exemple de résultat vitré sur une photo
// de salle. Les quatre contrôles sont ceux de l'analyse réelle (fiche Google,
// avis, voisins à moins de 600 m — lib/audit/places.ts —, vitesse mobile).
// Résultat d'exemple : établissement IMAGINAIRE.
const CHECKS = [
  {
    q: "Est-ce qu'on vous trouve sur Google ?",
    a: "Horaires, photos, bouton pour commander.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
    ),
  },
  {
    q: "Que disent vos avis ?",
    a: "Votre note et les reproches qui reviennent.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinejoin="round" aria-hidden>
        <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
      </svg>
    ),
  },
  {
    q: "Êtes-vous devant vos voisins ?",
    a: "Comparé aux restaurants à moins de 600 m.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </svg>
    ),
  },
  {
    q: "Votre site marche-t-il sur téléphone ?",
    a: "Ce que voit vraiment un client, et la vitesse.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" aria-hidden>
        <rect x="6" y="2" width="12" height="20" rx="3" />
        <path d="M11 18h2" strokeLinecap="round" />
      </svg>
    ),
  },
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
            <b>Gratuit</b> Analyse de votre restaurant
          </span>
          <h2 style={{ marginTop: 20 }}>Combien de clients perdez-vous avant même qu&apos;ils entrent ?</h2>
          <p className="bx-sub" style={{ marginTop: 18 }}>
            Avant de venir, vos clients regardent leur téléphone. L&apos;analyse vérifie ce qu&apos;ils y voient, et vous
            dit quoi corriger en premier.
          </p>
          <div className="bx-qs">
            {CHECKS.map((c) => (
              <div key={c.q} className="bx-qcard">
                <span className="bx-ic">{c.icon}</span>
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
              <b>Vous recevez une note sur 100</b>, puis sur WhatsApp les 5 choses à corriger en premier. Vous pouvez les
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
                <div>58</div>
              </div>
              <div>
                <b style={{ fontSize: 18 }}>Pizza Joe</b>
                <p style={{ fontSize: 14, opacity: 0.75, marginTop: 2 }}>4e sur 7 restaurants autour de vous</p>
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
