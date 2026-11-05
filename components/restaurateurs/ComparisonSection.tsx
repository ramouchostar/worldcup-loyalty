"use client";

import Link from "next/link";
import { useState } from "react";
import type { Plan } from "@/lib/entitlements";
import { TrackedLink } from "@/components/analytics/TrackedLink";
import {
  COMPARISON_ROWS,
  PLAN_NAME,
  PLAN_PRICE_EUR,
  checkedLabel,
  comparisonTotals,
  euros,
  includedDetail,
  isIncluded,
} from "@/lib/comparatif";
import { assistant } from "./brigade";

// « Sept abonnements ailleurs. Un seul forfait chez nous. » (maquette validée
// par Mehdi le 2026-11-05, https://claude.ai/artifact/Pkw8vEun7ryLSpZUwUjLyw).
// Données et règles dans lib/comparatif.ts. Tout le texte est rendu côté
// serveur (les trois forfaits ne changent que l'état), et chaque marque mène à
// son article comparatif du blog : maillage interne pour Google.
const PLANS: Plan[] = ["gratuit", "croissance", "pro"];

export function ComparisonSection() {
  const [plan, setPlan] = useState<Plan>("croissance");
  const t = comparisonTotals(plan);

  return (
    <section id="comparatif" className="bx-sec bx-x scroll-mt-16" aria-labelledby="comparatif-titre">
      <div className="bx-wrap bx-vs">
        <div className="bx-vs-head">
          <span className="bx-kicker">
            <b>Le calcul</b> Ce que vous payeriez ailleurs
          </span>
          <h2 id="comparatif-titre">Sept abonnements ailleurs. Un seul forfait chez nous.</h2>
          <p className="bx-sub">
            Fidélité, relances, chiffres, pub, avis, site, Google : voici ce que coûte chaque poste quand on le prend chez
            un spécialiste.
          </p>
        </div>

        <div className="bx-vs-tabs" role="group" aria-label="Comparer avec le forfait">
          <span>Comparer avec le forfait</span>
          {PLANS.map((p) => (
            <button key={p} type="button" aria-pressed={p === plan} onClick={() => setPlan(p)} className={p === plan ? "bx-on" : ""}>
              {PLAN_NAME[p]} · {euros(PLAN_PRICE_EUR[p])}
            </button>
          ))}
        </div>

        <div className="bx-vs-table">
          <div className="bx-vs-row bx-vs-th" aria-hidden>
            <span>Le poste</span>
            <span>Ailleurs, chez un spécialiste</span>
            <span>Prix moyen</span>
            <span>Chez Boosteats</span>
          </div>
          {COMPARISON_ROWS.map((r) => {
            const a = assistant(r.id);
            const inc = isIncluded(r, plan);
            const detail = includedDetail(r, plan);
            return (
              <div key={r.id} className={`bx-vs-row ${inc ? "" : "bx-vs-off"}`}>
                <div className="bx-vs-who">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.photo} alt="" loading="lazy" width={48} height={48} />
                  <div>
                    <h3>{r.job}</h3>
                    <span>
                      {a.name} · {r.post}
                      {r.pilot && <em className="bx-vs-pilot">en pilote</em>}
                    </span>
                  </div>
                </div>
                <div className="bx-vs-alt">
                  <ul>
                    {r.brands.map((b) => (
                      <li key={b.name}>
                        {b.article ? (
                          <Link href={`/blog/${b.article}`} title={`Comparer ${b.name} et Boosteats`}>
                            <b>{b.name}</b> · {b.price}
                          </Link>
                        ) : (
                          <span>
                            <b>{b.name}</b> · {b.price}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  {r.note && <small>{r.note}</small>}
                </div>
                <div className="bx-vs-avg">
                  ≈ {euros(r.avg)}
                  <small> {r.unit === "mois" ? "/mois" : "la création"}</small>
                </div>
                <div className="bx-vs-us">
                  {inc ? (
                    <>
                      <span className="bx-vs-check" aria-hidden>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      </span>
                      <span>
                        <b>Inclus</b>
                        {detail && <small>{detail}</small>}
                      </span>
                    </>
                  ) : (
                    <span className="bx-muted">Dans le forfait {PLAN_NAME[r.from]}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="bx-vs-totals">
          <div className="bx-vs-else">
            <small>Ailleurs, pour les mêmes postes</small>
            <strong>
              ≈ {euros(t.monthly)}
              <span> /mois</span>
            </strong>
            {t.oneOff > 0 && <p className="bx-vs-once">+ ≈ {euros(t.oneOff)} une fois, pour créer votre site</p>}
            <p>
              {t.count}&nbsp;abonnements ou prestataires, autant de factures, et c&apos;est à vous de tout faire marcher
              ensemble.
            </p>
          </div>
          <div className="bx-vs-ours">
            <small>Chez Boosteats, forfait {PLAN_NAME[plan]}</small>
            <strong>
              {euros(t.price)}
              <span> {t.price === 0 ? "pour toujours" : "HTVA /mois"}</span>
            </strong>
            <p>Un seul forfait. La brigade travaille ensemble, et notre équipe vous accompagne.</p>
            <em>≈ {euros(t.savedMonthly)} de moins chaque mois</em>
          </div>
        </div>

        <div className="bx-vs-cta">
          <TrackedLink ctaId="audit_gratuit" ctaLocation="comparatif" audience="restaurateur" href="/audit-gratuit" className="bx-btn bx-btn-ink">
            Commencer par l&apos;analyse gratuite
          </TrackedLink>
          <Link href="/blog/combien-coute-le-marketing-d-un-restaurant">Lire le comparatif complet</Link>
          <a href="#plans">Voir le détail des forfaits</a>
        </div>

        <p className="bx-vs-fine">
          Prix publics HTVA, par établissement, relevés en {checkedLabel()}{" "}
          sur les sites des éditeurs, des agences et des
          comparateurs, puis arrondis. Ils peuvent changer, et une offre sur devis peut coûter plus ou moins. Le budget
          publicitaire (payé à Meta) n&apos;est compté nulle part : vous le payez dans les deux cas. Les marques citées
          appartiennent à leurs propriétaires et ne sont pas liées à Boosteats.
        </p>
      </div>
    </section>
  );
}
