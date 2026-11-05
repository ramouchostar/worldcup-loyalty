"use client";

import { useState } from "react";
import type { AssistantId } from "@/lib/agents/types";
import { IPhone, PHOTOS } from "./IPhone";
import { assistant } from "./brigade";

// « Votre part du travail ? 5 minutes par jour. » (Brigade 17, maquette du
// 2026-11-04), au style de la maquette : photo de cuisine, étapes vitrées, et un
// iPhone à essayer qui rejoue l'écran « Idées du jour » (ADR 0089 §2 : Oui / Non,
// trois idées par jour au plus). Données d'illustration, marquées « exemple ».
const STEPS = [
  { n: "1", title: "Une idée arrive sur votre téléphone", desc: "Pas d'ordinateur, rien à installer." },
  { n: "2", title: "Vous lisez 3 lignes", desc: "Ce qu'on fait, pour qui, combien ça coûte." },
  { n: "3", title: "Vous répondez oui ou non", desc: "Oui, c'est parti. Non, rien ne se passe, et la brigade retient pourquoi." },
];

const PROMISES = ["Rien ne part sans votre accord", "Aucun euro dépensé sans votre accord", "Trois idées par jour au plus"];

const IDEAS: { id: AssistantId; text: string; meta: string; ok: string }[] = [
  { id: "hugo", text: "340 clients ne sont pas revenus depuis 3 semaines. Je leur offre une boisson mardi soir ?", meta: "Coût maximum : 40 € · exemple", ok: "Hugo envoie mardi à 16 h" },
  { id: "emma", text: "Pub « Family Bucket » à 3 km, 14 € par jour pendant 2 semaines.", meta: "8 000 à 12 000 personnes touchées · exemple", ok: "Emma prépare la pub" },
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
            {yes ? "✓" : "✕"}
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
            <small style={{ fontSize: 11.5, fontWeight: 700, opacity: 0.6, padding: "6px 6px 0" }}>ENSUITE</small>
          )}
          {IDEAS.slice(i + 1).map((r) => {
            const b = assistant(r.id);
            return (
              <div key={r.id} className="bx-done bx-glass" style={{ opacity: 0.85 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={b.photo} alt="" />
                {b.name} · {b.post}
              </div>
            );
          })}
        </>
      ) : (
        <div className="bx-empty bx-glass">
          <b>C&apos;est tout pour aujourd&apos;hui.</b>
          <span style={{ fontSize: 14, opacity: 0.75 }}>3 décisions, environ 4 minutes.</span>
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
          <div>
            <h2>Votre part du travail&#8239;? 5&nbsp;minutes par jour.</h2>
            <p className="bx-sub" style={{ marginTop: 16 }}>
              La brigade prépare tout. Vous lisez, vous répondez, vous retournez en cuisine.
            </p>
            <ol className="bx-steps">
              {STEPS.map((s) => (
                <li key={s.n} className="bx-step bx-glass-dark">
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
          </div>
          <div>
            <IPhone width={310} wallpaper={{ background: "linear-gradient(160deg,#F4F7EA,#E6ECD3 45%,#D9E3BE)" }}>
              <IdeasDemo />
            </IPhone>
            <p style={{ fontSize: 12.5, color: "rgba(239,241,228,0.75)", textAlign: "center", marginTop: 18 }}>
              À essayer · exemple, établissement imaginaire
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
