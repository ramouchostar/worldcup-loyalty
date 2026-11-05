import { KRAAINEM_CASE, euros } from "@/lib/case-studies";
import { PHOTOS } from "./IPhone";

// Le cas Kraainem sur la landing, au style de la maquette (la hausse en grand,
// avant puis aujourd'hui). Photo : une vraie photo Belchicken (2026-11-05). Chiffres et accord : source
// unique `lib/case-studies.ts` (accord d'Aram du 2026-11-02). Ce qu'on a fait
// ENSEMBLE, jamais « grâce à nous » (ADR 0064). Pas de citation inventée.
export function ProofSection() {
  const { restaurant, before, after } = KRAAINEM_CASE;
  const growth = Math.round(((after - before) / before) * 100);
  const beforeHeight = Math.round((before / after) * 100);
  return (
    <section id="cas-client" className="bx-sec bx-x scroll-mt-16" style={{ paddingTop: 0 }}>
      <div className="bx-wrap">
        <div className="bx-proof">
          <div className="bx-ph">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="bx-bgimg" src={PHOTOS.belchicken} alt="Tenders, frites et sauces servis chez Belchicken" loading="lazy" />
          </div>
          <div className="bx-tx">
            <span className="bx-kicker">
              <b>Cas client</b> {restaurant}
            </span>
            <div className="bx-growth">
              <span className="bx-up">+{growth}&nbsp;%</span>
              <span className="bx-gl">de chiffre d&apos;affaires par mois</span>
            </div>
            <div
              className="bx-flow"
              role="img"
              aria-label={`De ${euros(before)} à ${euros(after)} de chiffre d'affaires par mois`}
            >
              <div className="bx-fb">
                <small>Avant</small>
                <b>{euros(before)}</b>
                <i style={{ height: `${beforeHeight}%` }} />
              </div>
              <svg className="bx-arrow" viewBox="0 0 64 24" aria-hidden>
                <path d="M2 12h54M46 3l10 9-10 9" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <div className="bx-fb bx-now">
                <small>Aujourd&apos;hui</small>
                <b>{euros(after)}</b>
                <i style={{ height: "100%" }} />
              </div>
            </div>
            <p className="bx-muted">
              Notre but, c&apos;est de faire monter votre chiffre d&apos;affaires. À Kraainem, on l&apos;a fait ensemble
              avec le propriétaire, en plus d&apos;un an : des milliers de clients inscrits et relancés chaque semaine, le
              chiffre lu jour par jour, de la pub dans le quartier toute l&apos;année.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
