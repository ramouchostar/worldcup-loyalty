"use client";

import { useState } from "react";
import type { AssistantId } from "@/lib/agents/types";
import { IPhone, PHOTOS } from "./IPhone";
import { assistant } from "./brigade";
import { Check, Close } from "@/components/icons";

// « Votre part du travail ? 5 minutes par jour. » (Brigade 17, maquette du
// 2026-11-04), au style de la maquette : photo de cuisine, étapes en cartes pleines (charte anti-slop), et un
// iPhone à essayer qui rejoue l'écran « Idées du jour » (ADR 0089 §2 : Oui / Non,
// trois idées par jour au plus). Données d'illustration, marquées « exemple ».
const STEPS = [
  { n: "1", title: "Une idée arrive sur votre téléphone", desc: "Pas d'ordinateur, rien à installer." },
  { n: "2", title: "Vous lisez 3 lignes", desc: "Ce qu'on fait, pour qui, combien ça coûte." },
  { n: "3", title: "Vous répondez oui ou non", desc: "Oui, c'est parti. Non, rien ne se passe, et la brigade retient pourquoi." },
];

const PROMISES = ["Rien ne part sans votre accord", "Aucun euro dépensé sans votre accord", "Trois idées par jour au plus"];

const IDEAS: { id: AssistantId; text: string; meta: string; ok: string }[] = [
  { id: "hugo", text: "340 clients ne sont pas revenus depuis 3 semaines. Je leur offre une boisson mardi soir ?", meta: "Coût maximum : 40 € (exemple)", ok: "Hugo envoie mardi à 16 h" },
  { id: "emma", text: "Pub « Family Bucket » à 3 km, 14 € par jour pendant 2 semaines.", meta: "8 000 à 12 000 personnes touchées (exemple)", ok: "Emma prépare la pub" },
  { id: "louis", text: "Avis 2 étoiles : « frites froides ». Ma réponse est prête, je l'envoie ?", meta: "Vous pouvez la lire avant", ok: "Louis envoie la réponse" },
];

function IdeasDemo() {
  const [i, setI] = useState(0);
  const [done, setDone] = useState<boolean[]>([]);
  const [leaving, setLeaving] = useState(false);

  const answer = (yes: boolean) => {
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setLeaving(true);
    setTimeout(
      () => {
        setDone((d) => [...d, yes]);
        setI((n) => n + 1);
        setLeaving(false);
      },
      reduce ? 0 : 300,
    );
  };

  const idea = IDEAS[i];
  const a = idea ? assistant(idea.id) : null;
  return (
    <div className="bx-scr-in" aria-live="polite">
      <div className="bx-app-head">
        <div>
          <small>Mardi 12 novembre</small>
          <b>Idées du jour</b>
        </div>
        <span className="bx-pill">{IDEAS.length - i} à valider</span>
      </div>
      {done.map((yes, k) => (
        <div key={k} className="bx-done bx-glass">
          <i className={yes ? "" : "bx-refused"} aria-hidden>
            {yes ? <Check size={14} /> : <Close size={14} />}
          </i>
          {yes ? IDEAS[k].ok : "Refusé, rien ne part"}
        </div>
      ))}
      {idea && a ? (
        <>
          <div className={`bx-card bx-glass ${leaving ? "bx-gone" : ""}`}>
            <div className="bx-whom">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.photo} alt="" />
              <div>
                <b>{a.name}</b>
                <span>{a.post}</span>
              </div>
            </div>
            <p>{idea.text}</p>
            <span className="bx-meta">{idea.meta}</span>
            <div className="bx-yn">
              <button type="button" className="bx-no" onClick={() => answer(false)} disabled={leaving}>
                Non
              </button>
              <button type="button" className="bx-yes" onClick={() => answer(true)} disabled={leaving}>
                Oui
              </button>
            </div>
          </div>
          {IDEAS.slice(i + 1).length > 0 && (
            <small className="bx-next">Ensuite</small>
          )}
          {IDEAS.slice(i + 1).map((r) => {
            const b = assistant(r.id);
            return (
              <div key={r.id} className="bx-done bx-glass">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={b.photo} alt="" />
                {b.name}, {b.post.charAt(0).toLowerCase() + b.post.slice(1)}
              </div>
            );
          })}
          <div className="bx-tally">
            <span className="bx-tally-bar" aria-hidden>
              {IDEAS.map((_, k) => (
                <i key={k} className={k < done.length ? "bx-on" : ""} />
              ))}
            </span>
            <small>
              {`${done.length} sur ${IDEAS.length}\u00a0· environ 4\u00a0minutes en tout`}
            </small>
          </div>
        </>
      ) : (
        <div className="bx-empty bx-glass">
          <b>C&apos;est tout pour aujourd&apos;hui.</b>
          <span style={{ fontSize: 15, color: "var(--bx-muted)" }}>3 décisions, environ 4 minutes.</span>
          <button
            type="button"
            className="bx-linkbtn"
            onClick={() => {
              setI(0);
              setDone([]);
            }}
          >
            Revoir l&apos;exemple
          </button>
        </div>
      )}
    </div>
  );
}

export function FiveMinutesSection() {
  return (
    <section id="cinq-minutes" className="bx-sec bx-x scroll-mt-16" style={{ paddingTop: 0 }}>
      <div className="bx-wrap">
        <div className="bx-five">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="bx-bgimg" src={PHOTOS.cuisine} alt="" aria-hidden loading="lazy" />
          {/* Grille nommée (landing.css) : sur mobile, le téléphone à essayer
              passe juste sous le titre, avant les étapes. */}
          <div className="bx-five-head">
            <h2>Votre part du travail&#8239;? 5&nbsp;minutes par jour.</h2>
            <p className="bx-sub" style={{ marginTop: 16 }}>
              La brigade prépare tout. Vous lisez, vous répondez, vous retournez en cuisine.
            </p>
          </div>
          <ol className="bx-steps">
            {STEPS.map((s) => (
              <li key={s.n} className="bx-step">
                <span className="bx-n">{s.n}</span>
                <div>
                  <b>{s.title}</b>
                  <span>{s.desc}</span>
                </div>
              </li>
            ))}
          </ol>
          <ul className="bx-promise">
            {PROMISES.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <div className="bx-five-phone">
            <IPhone width={310} wallpaper={{ background: "#EFF1E4" }}>
              <IdeasDemo />
            </IPhone>
            <p className="bx-five-note">
              À essayer. Exemple, établissement imaginaire
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
