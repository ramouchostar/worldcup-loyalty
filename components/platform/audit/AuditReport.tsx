import Link from "next/link";
import { TrackedLink } from "@/components/analytics/TrackedLink";
import type { AuditRow, SectionRow } from "@/lib/audit/store";
import type { BusinessInfo, StoredReview } from "@/lib/audit/dataforseo";
import type { FicheScore } from "@/lib/audit/fiche-score";
import type { ReviewsResultSummary } from "@/lib/audit/measure";
import type { ReviewThemes } from "@/lib/audit/review-themes";
import { gridPoints, isKnownBrand, type Competitor, type CompetitorsResult } from "@/lib/audit/competitors";
import { neighborsMap, whoOutranks } from "@/lib/audit/neighbors-map";
import type { Recommendations } from "@/lib/audit/recommend";
import type { Change } from "@/lib/audit/revise";
import type { Scenario } from "@/lib/audit/scenarios";
import type { AuditSignals, OwnerAnswers } from "@/lib/audit/signals";
import type { SeoResult, SeoStatus } from "@/lib/audit/seo";
import {
  ACTION_LABEL,
  HORIZON_LABEL,
  avisPotential,
  cardsFor,
  chartPoints,
  communeOf,
  fichePotential,
  globalScores,
  heroFor,
  latestNegative,
  seoPotential,
  type ActionKey,
  type CardModel,
} from "@/lib/audit/report-model";
import { AnswersForm } from "./AnswersForm";
import { NeighborsMapView } from "./NeighborsMapView";
import s from "./report.module.css";

// ADR 0069 §5 — le rapport d'audit, mis en page comme la maquette validée
// (https://claude.ai/artifact/M84iF3srLZdE6sCn9FCf2y). Les données viennent de
// l'audit enregistré ; les volets pas encore livrés s'affichent « bientôt ».

type Info = BusinessInfo & {
  main_image?: string | null;
  book_online_url?: string | null;
  people_also_search?: { cid: string; title: string; rating?: { value: number | null; votes_count: number | null } | null }[] | null;
};
// Une révision est stockée avec le seul identifiant et titre de chaque scénario.
type Ref = { id: string; title: string };
type StoredChange = Change extends infer C ? (C extends { scenario: unknown } ? Omit<C, "scenario"> & { scenario: Ref } : never) : never;
type StoredRecommendations = Recommendations & {
  revision?: { changes: StoredChange[]; newlyMatched: number };
};

const fmt = (n: number, d = 2) => n.toLocaleString("fr-BE", { maximumFractionDigits: d });
const monthLabel = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString("fr-BE", { month: "short", year: "numeric", timeZone: "UTC" });
};
const LVL = ["", "très faible", "faible", "moyen", "fort", "très fort"];

type ConsoleProps = {
  mode?: "console";
  saveAnswers: (fd: FormData) => void;
  reanalyse: () => void;
  analyseCompetitors: () => void;
  analyseSeo: () => void;
  /** Versions figées et liens partagés (ADR 0069 §6), en tête du rapport. */
  sharePanel?: React.ReactNode;
};
// Le rapport remis au gérant (lien partagé, PDF) : mêmes blocs, sans les
// boutons, les motifs d'échec ni les détails techniques de la console.
type PublicProps = { mode: "public"; toolbar?: React.ReactNode };

export function AuditReport(props: { audit: AuditRow; sections: SectionRow[] } & (ConsoleProps | PublicProps)) {
  const { audit, sections } = props;
  const isPublic = props.mode === "public";
  const actions = props.mode === "public" ? null : props;
  const byKey = Object.fromEntries(sections.map((x) => [x.section, x])) as Partial<Record<SectionRow["section"], SectionRow>>;
  const info = byKey.fiche?.status === "ok" ? (byKey.fiche.raw as Info) : null;
  const fiche = byKey.fiche?.status === "ok" ? (byKey.fiche.result as FicheScore) : null;
  const avis = byKey.avis?.status === "ok" ? (byKey.avis.result as ReviewsResultSummary) : null;
  const reviews = byKey.avis?.status === "ok" ? ((byKey.avis.raw as { reviews?: StoredReview[] })?.reviews ?? []) : [];
  const reco = audit.recommendations as StoredRecommendations | null;
  const signals = audit.signals as AuditSignals | null;
  const answers = audit.answers as OwnerAnswers | null;
  const scores = (audit.scores ?? {}) as { fiche?: number | null; avis?: number | null; concurrents?: number | null; seo?: number | null };
  const seo = byKey.seo?.status === "ok" ? (byKey.seo.result as SeoResult) : null;
  const comp = byKey.concurrents?.status === "ok" ? (byKey.concurrents.result as CompetitorsResult) : null;

  const rating = info?.rating?.value ?? null;
  const potentials = {
    fiche: fiche ? fichePotential(fiche) : null,
    avis: avis ? avisPotential(rating, avis, signals?.trend ?? null) : null,
  };
  const global = globalScores(
    { fiche: scores.fiche ?? null, avis: scores.avis ?? null, concurrents: scores.concurrents ?? null, seo: scores.seo ?? null },
    { ...potentials, concurrents: scores.concurrents ?? null, seo: seo ? seoPotential(seo) : null },
  );
  const commune = communeOf(audit.postal_code);
  const top = reco?.top ?? [];
  const hero = heroFor({
    name: info?.title ?? audit.name,
    commune,
    category: info?.category ?? null,
    rating,
    reviews: info?.rating?.votes_count ?? null,
    responseShare: avis?.responses.share ?? null,
    top,
    now: global.now,
    potential: global.potential,
    date: new Date(audit.created_at),
  });
  const cards = info ? cardsFor(info, fiche?.gaps ?? []) : null;
  const negative = latestNegative(reviews);
  const lowResponses = (avis?.responses.share ?? 1) < 0.8;

  return (
    <div className={s.report}>
      <div className={s.page}>
        <div className={`${s.bar} ${s.noPrint}`}>
          {isPublic ? <span /> : <Link href="/platform/audit" className={s.back}>← Tous les audits</Link>}
          {props.mode === "public" ? props.toolbar : <span className={s.logo}>boost<b>eats</b> · audit</span>}
        </div>
        {isPublic && <span className={`${s.logo} ${s.printOnly}`}>boost<b>eats</b> · audit</span>}
        {actions?.sharePanel}

        {!isPublic && audit.status === "en_cours" && <p className={s.notice}>Mesure en cours (1 à 4 minutes) : la page se met à jour toute seule.</p>}
        {!isPublic && fiche?.approximate && (
          <p className={s.notice}>
            Fiche trouvée avec le libellé raccourci « {fiche.approximate} » : vérifie l&apos;adresse ({audit.address ?? "inconnue"}). Pour viser juste, relance avec le lien Google Maps.
          </p>
        )}

        {/* 1. Ouverture */}
        <div className={s.hero}>
          <div style={{ position: "relative", zIndex: 1 }}>
            <span className={s.eyebrow}>{audit.status === "revise" || audit.status === "final" ? `Version révisée · ${hero.eyebrow}` : hero.eyebrow}</span>
            <h1>
              {hero.before}
              <em>{hero.highlight}</em>
              {hero.after}
            </h1>
            <p>{hero.lead}</p>
            {hero.now != null && (
              <div className={s.gauge}>
                <div className={s.gaugeFrom}>
                  <span className={s.num}>{hero.now}</span>
                  <small>aujourd&apos;hui, sur 100</small>
                </div>
                {hero.potential != null && hero.potential > hero.now && (
                  <>
                    <span className={s.arrow} aria-hidden="true">→</span>
                    <div className={s.gaugeTo}>
                      <span className={s.num}>{hero.potential}</span>
                      <small>après les priorités</small>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          {cards && (
            <div className={s.cards}>
              <div>
                <div className={s.lbl}>Votre fiche aujourd&apos;hui</div>
                <GbpCard card={cards.today} footer={negative ? <><b>Dernier avis négatif :</b> « {negative.text} »{negative.answered ? "" : <b> · sans réponse</b>}</> : null} />
              </div>
              {/* La fiche « dans 90 jours » n'apparaît que si le plan la change vraiment. */}
              {(cards.after.actions.some((a) => a.state === "new") || lowResponses) && (
                <div>
                  <div className={`${s.lbl} ${s.lblAfter}`}>Dans 90 jours (objectif)</div>
                  <GbpCard card={cards.after} footer={lowResponses ? <><b>Réponse du propriétaire</b> à chaque avis, dans la semaine.</> : null} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* 2. Les notes */}
        <section className={s.section}>
          <div>
            <span className={s.eyebrow}>Vos notes</span>
            <h2>Où vous en êtes, et jusqu&apos;où vous pouvez aller</h2>
          </div>
          <div className={s.scores}>
            <ScoreTile label="Fiche Google" now={scores.fiche ?? null} potential={potentials.fiche} note={fiche ? `sur ${fiche.verified} critères vérifiés` : (!isPublic && byKey.fiche?.error) || null} />
            <ScoreTile label="Avis" now={scores.avis ?? null} potential={potentials.avis} note={avis ? `${avis.read} avis lus sur ${avis.total ?? "?"}` : (!isPublic && byKey.avis?.error) || null} />
            <ScoreTile label="Face aux voisins" now={scores.concurrents ?? null} potential={null} note={comp ? `${comp.competitors.length} voisins · « ${comp.keyword} »` : (!isPublic && byKey.concurrents?.error) || "Pas encore analysé"} />
            <ScoreTile label="Site et Google (SEO)" now={scores.seo ?? null} potential={seo ? seoPotential(seo) : null} note={seo ? (seo.organic ? (seo.organic.rank ? `${seo.organic.rank}e sur « ${seo.organic.keyword} »` : `absent du top 20 sur « ${seo.organic.keyword} »`) : "rang Google non vérifié") : (!isPublic && byKey.seo?.error) || "Pas encore analysé"} />
            <ScoreTile label="Réseaux sociaux" now={null} potential={null} note="Bientôt dans l'audit" />
          </div>
        </section>

        {comp && <Neighbors comp={comp} auditId={audit.id} isPublic={isPublic} self={{ name: info?.title ?? audit.name, rating, reviews: info?.rating?.votes_count ?? null, photos: info?.total_photos ?? null, hasOrderButton: !!info?.book_online_url, hasWebsite: !!info?.url, lat: info?.latitude ?? null, lng: info?.longitude ?? null }} />}
        {actions && !comp && info && audit.status !== "en_cours" && (
          <form action={actions.analyseCompetitors} className={s.notice} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span>{byKey.concurrents?.status === "echec" ? `Concurrents non analysés : ${byKey.concurrents.error}` : "Les concurrents autour de ce restaurant n'ont pas encore été analysés (2 à 4 minutes)."}</span>
            <button type="submit" className={s.cta}>Analyser les concurrents</button>
          </form>
        )}

        {seo ? (
          <SeoSection seo={seo} />
        ) : (
          actions && info && audit.status !== "en_cours" && (
            <form action={actions.analyseSeo} className={s.notice} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span>{byKey.seo?.status === "echec" ? `Site et Google non analysés : ${byKey.seo.error}` : "Le site du restaurant et sa place dans Google n'ont pas encore été analysés."}</span>
              <button type="submit" className={s.cta}>Analyser le site et Google</button>
            </form>
          )
        )}

        {/* 3 bis. Sans volet Concurrents : les fiches que Google propose à côté */}
        {!comp && info?.people_also_search && info.people_also_search.length > 0 && (
          <section className={s.section}>
            <div>
              <span className={s.eyebrow}>Votre quartier</span>
              <h2>Les fiches que Google propose aussi à vos clients</h2>
              <p className={s.lead}>Quand un client regarde votre fiche, Google lui montre ces établissements juste en dessous.</p>
            </div>
            <div className={s.hood}>
              {info.people_also_search.slice(0, 4).map((p) => (
                <div key={p.cid} className={s.gbp}>
                  <div className={s.bd}>
                    <span className={s.nm}>{p.title}</span>
                    {p.rating?.value != null ? (
                      <span className={s.rt}>
                        <b>{fmt(p.rating.value, 1)}</b>
                        <span className={s.stars}>{stars(p.rating.value)}</span>({(p.rating.votes_count ?? 0).toLocaleString("fr-BE")})
                      </span>
                    ) : (
                      <span className={s.cat}>Pas encore de note</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 4. Révision par les réponses du gérant */}
        {answers && <Revision answers={answers} reco={reco} />}

        {/* 5. Les priorités */}
        {top.length > 0 && (
          <section className={s.section}>
            <div>
              <span className={s.eyebrow}>Le plan</span>
              <h2>{top.length === 1 ? "Votre priorité" : `Vos ${top.length} priorités, dans l'ordre`}</h2>
              <p className={s.lead}>Classées par effet attendu et par effort. Chacune dit quoi faire et quel chiffre suivre.</p>
            </div>
            <div className={s.prios}>
              {top.map((p, i) => (
                <Priority key={p.id} p={p} n={i + 1} isNew={!!reco?.revision?.changes.some((c) => c.kind === "ajoutee" && c.scenario.id === p.id)} />
              ))}
            </div>
          </section>
        )}

        {/* 6. Les avis */}
        {avis && (
          <section className={s.card} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className={s.bar}>
              <div>
                <span className={s.eyebrow}>Avis</span>
                <h2 style={{ margin: 0, fontSize: 20 }}>Ce que disent vos clients</h2>
              </div>
              <span className={s.sum}>{avis.read} avis lus sur {avis.total ?? "?"}</span>
            </div>
            <dl className={s.stats}>
              <div><dt>Réponses (12 mois)</dt><dd>{avis.responses.share != null ? `${Math.round(avis.responses.share * 100)} %` : "—"}</dd></div>
              <div><dt>Délai de réponse</dt><dd>{avis.responses.medianDelayDays != null ? `${Math.round(avis.responses.medianDelayDays)} j` : "—"}</dd></div>
              <div><dt>Réponses aux 1–2★</dt><dd>{avis.responses.negativeShare != null ? `${Math.round(avis.responses.negativeShare * 100)} %` : "—"}</dd></div>
              <div>
                <dt>Bascule</dt>
                <dd>{avis.breakpoint ? `${monthLabel(avis.breakpoint.month)} : ${fmt(avis.breakpoint.before)} → ${fmt(avis.breakpoint.after)}★` : "aucune nette"}</dd>
              </div>
            </dl>
            <ReviewsChart summary={avis} />
            {avis.themes ? (
              <Themes themes={avis.themes} />
            ) : (
              actions && <form action={actions.reanalyse} className={s.notice} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <span>{avis.themesError ? `Thèmes des avis non analysés : ${avis.themesError}` : "Les thèmes positifs et négatifs de ces avis n'ont pas encore été analysés."}</span>
                <button type="submit" className={s.cta}>Analyser les thèmes des avis</button>
              </form>
            )}
            <div className={s.two}>
              <Distribution dist={info?.rating_distribution ?? avis.distribution} />
              <Topics themes={avis.themes ?? null} topics={info?.place_topics ?? null} />
            </div>
          </section>
        )}

        {/* 7. Calendrier */}
        {reco && reco.matched > 0 && (
          <section className={s.section}>
            <div>
              <span className={s.eyebrow}>Calendrier</span>
              <h2>Les 90 prochains jours</h2>
            </div>
            <div className={s.plan}>
              {(Object.keys(HORIZON_LABEL) as (keyof typeof HORIZON_LABEL)[]).filter((h) => reco.plan[h].length > 0).map((h) => (
                <div key={h} className={s.planCol}>
                  <h3>
                    {HORIZON_LABEL[h]}
                    <small>{reco.plan[h].length} action{reco.plan[h].length > 1 ? "s" : ""}</small>
                  </h3>
                  <ul>
                    {reco.plan[h].map((x) => (
                      <li key={x.id}>{x.title}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 8. Approfondir (console) */}
        {actions && audit.status !== "en_cours" && <AnswersForm action={actions.saveAnswers} initial={answers} />}

        {/* 9. Ce que Boosteats fait pour lui, et UN appel à l'action */}
        <BoosteatsPlan name={info?.title ?? audit.name} top={top} answers={answers} now={global.now} potential={global.potential} />

        {/* Console seulement : l'état de chaque volet, avec son motif (jamais d'échec silencieux). */}
        {!isPublic && <details className={s.tech}>
          <summary>Détails techniques de l&apos;audit</summary>
          <table>
            <tbody>
              {sections.map((x) => (
                <tr key={x.section}>
                  <th>{x.section}</th>
                  <td>{x.status}{x.source ? ` · ${x.source}` : ""}</td>
                  <td>{x.error ?? ""}</td>
                </tr>
              ))}
              <tr>
                <th>coût</th>
                <td>{fmt(Number(audit.cost_usd), 3)} $</td>
                <td>{Object.entries(audit.calls ?? {}).map(([k, v]) => `${k} : ${v} requêtes`).join(" · ")}</td>
              </tr>
            </tbody>
          </table>
        </details>}
      </div>
    </div>
  );
}

function stars(v: number) {
  const full = Math.round(v);
  return "★★★★★".slice(0, full) + "☆☆☆☆☆".slice(0, 5 - full);
}

const ICON: Record<ActionKey, React.ReactNode> = {
  itineraire: <path d="M12 2 22 12 12 22 2 12Z M9 13v-2h5V9l3 3-3 3v-2" />,
  appeler: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />,
  site: <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />,
  commander: <path d="M6 7h12l-1 13H7Z M9 7a3 3 0 0 1 6 0" />,
  menu: <path d="M5 4h14v16H5z M8 8h8M8 12h8M8 16h5" />,
};

function GbpCard({ card, footer }: { card: CardModel; footer: React.ReactNode }) {
  return (
    <div className={s.gbp}>
      {card.photo ? (
        <div className={s.ph} style={{ backgroundImage: `url("${card.photo}")` }} role="img" aria-label={`Photo de ${card.name}`} />
      ) : (
        <div className={`${s.ph} ${s.phEmpty}`}>Pas de photo de couverture</div>
      )}
      <div className={s.bd}>
        <span className={s.nm}>{card.name}</span>
        {card.rating != null && (
          <span className={s.rt}>
            <b>{fmt(card.rating, 1)}</b>
            <span className={s.stars}>{stars(card.rating)}</span>({(card.reviews ?? 0).toLocaleString("fr-BE")})
          </span>
        )}
        <span className={s.cat}>{[card.category, card.price].filter(Boolean).join(" · ")}</span>
        {card.open && <span className={s.open}>{card.open}</span>}
      </div>
      <div className={s.acts}>
        {card.actions.map((a) => (
          <span key={a.key} className={`${s.act} ${a.state === "off" ? s.actOff : a.state === "new" ? s.actNew : ""}`}>
            <s>
              <svg viewBox="0 0 24 24" aria-hidden="true">{ICON[a.key]}</svg>
            </s>
            {ACTION_LABEL[a.key]}
          </span>
        ))}
      </div>
      {footer && <div className={s.rev}>{footer}</div>}
    </div>
  );
}

function ScoreTile({ label, now, potential, note }: { label: string; now: number | null; potential: number | null; note: string | null }) {
  return (
    <div className={s.score}>
      <span className={s.k}>{label}</span>
      {now != null ? (
        <>
          <span className={s.num}>
            {now}
            <small>/100</small>
          </span>
          <div className={s.track}>
            {potential != null && <u style={{ width: `${potential}%` }} />}
            <i style={{ width: `${now}%` }} />
          </div>
          {potential != null && potential > now ? (
            <span className={s.pot}>
              Potentiel <b>{potential}</b>
            </span>
          ) : (
            <span className={s.pot}>Au niveau</span>
          )}
        </>
      ) : (
        <span className={s.soon}>—</span>
      )}
      {note && <span className={s.soon}>{note}</span>}
    </div>
  );
}

function Priority({ p, n, isNew }: { p: Scenario; n: number; isNew: boolean }) {
  return (
    <article className={s.prio}>
      <span className={s.n}>{n}</span>
      <h3>
        {p.title} {isNew && <span className={`${s.tag} ${s.tagNew}`}>Nouveau</span>}
      </h3>
      <p className={s.d}>{p.diagnostic}</p>
      <div>
        <ul>
          {p.steps.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        <div className={s.chips}>
          <span className={`${s.chip} ${s.chipGood}`}>Effet {LVL[p.impact]}</span>
          <span className={s.chip}>Effort {LVL[p.effort]}</span>
          <span className={s.chip}>{p.horizon}</span>
          <span className={s.chip}>À suivre : {p.kpi}</span>
        </div>
      </div>
      {p.boosteats && (
        <div className={s.boost}>
          <b>Comment Boosteats aide.</b> {p.boosteats}
        </div>
      )}
    </article>
  );
}

function ReviewsChart({ summary }: { summary: ReviewsResultSummary }) {
  const pts = chartPoints(summary);
  if (pts.length < 2) return null;
  const W = 600, H = 180, L = 36, R = 590, T = 20, B = 160;
  const y = (v: number) => T + ((5 - v) / 2) * (B - T); // échelle 3★ → 5★
  const x = (i: number) => L + (i / (pts.length - 1)) * (R - L);
  const bpIndex = summary.breakpoint ? pts.findIndex((p) => p.month === summary.breakpoint!.month) : -1;
  const years = pts.map((p, i) => ({ i, label: p.month.slice(0, 4), first: i === 0 || p.month.slice(0, 4) !== pts[i - 1].month.slice(0, 4) })).filter((p) => p.first);
  return (
    <svg className={s.chart} viewBox={`0 0 ${W} ${H + 12}`} width="100%" role="img" aria-label="Note moyenne glissante sur 3 mois, 24 derniers mois">
      <g stroke="#E2E2DC">
        {[5, 4, 3].map((v) => (
          <line key={v} x1={L} y1={y(v)} x2={R} y2={y(v)} />
        ))}
      </g>
      {[5, 4, 3].map((v) => (
        <text key={v} x={L - 6} y={y(v) + 4} textAnchor="end">
          {v}★
        </text>
      ))}
      {bpIndex >= 0 && (
        <>
          <rect x={x(bpIndex)} y={T - 6} width={R - x(bpIndex)} height={B - T + 6} fill="#F7EBD6" opacity={0.7} />
          <line x1={x(bpIndex)} y1={T - 6} x2={x(bpIndex)} y2={B} stroke="#9E6612" strokeDasharray="4 3" />
          <text x={x(bpIndex) + 6} y={T + 8} style={{ fill: "#9E6612", fontWeight: 700 }}>
            bascule : {monthLabel(summary.breakpoint!.month)}
          </text>
        </>
      )}
      <polyline
        fill="none"
        stroke="#6B7C3F"
        strokeWidth={2.5}
        strokeLinejoin="round"
        points={pts.map((p, i) => `${x(i)},${y(Math.max(3, Math.min(5, p.value)))}`).join(" ")}
      />
      <circle cx={x(pts.length - 1)} cy={y(Math.max(3, Math.min(5, pts[pts.length - 1].value)))} r={4} fill="#6B7C3F" />
      {years.map((yv) => (
        <text key={yv.i} x={x(yv.i)} y={H + 8}>
          {yv.label}
        </text>
      ))}
    </svg>
  );
}

const pct = (x: number) => `${Math.round(x * 100)} %`;

const SEO_PILL: Record<SeoStatus, string> = { ok: "OK", partiel: "À améliorer", manquant: "Manquant", non_verifie: "Non vérifié" };

function SeoSection({ seo }: { seo: SeoResult }) {
  const cls = (st: SeoStatus) => (st === "ok" ? s.chipPos : st === "manquant" ? s.chipNeg : st === "partiel" ? s.chipWarn : "");
  return (
    <section className={s.section}>
      <div>
        <span className={s.eyebrow}>Site et Google</span>
        <h2>Ce que Google voit de vous en dehors de Maps</h2>
        <p className={s.lead}>
          {seo.site ? <>Site lu : {seo.site.finalUrl ?? seo.site.url}.</> : seo.siteError} {seo.organic ? <>Recherche Google « {seo.organic.keyword} » faite depuis Bruxelles.</> : null}
        </p>
      </div>
      <div className={s.two}>
        <div className={s.card} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <b>Votre site : {seo.score ?? "—"}/100</b>
          {seo.checks.map((c) => (
            <div key={c.key} className={s.bar} style={{ alignItems: "baseline" }}>
              <span style={{ fontSize: 13 }}>
                {c.label}
                {c.detail && <span className={s.sum} style={{ display: "block", fontWeight: 500 }}>{c.detail}</span>}
              </span>
              <span className={`${s.chip} ${cls(c.status)}`}>{SEO_PILL[c.status]}</span>
            </div>
          ))}
        </div>
        {seo.organic && (
          <div className={s.card} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <b>Qui apparaît dans Google sur « {seo.organic.keyword} »</b>
            <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
              {seo.organic.top.map((t) => (
                <li key={t.rank + t.domain} style={{ fontWeight: seo.organic?.rank === t.rank ? 700 : 400 }}>
                  {t.domain}
                  {seo.organic?.rank === t.rank ? " (vous)" : /ubereats|deliveroo|takeaway|just-eat/i.test(t.domain) ? " · plateforme de livraison" : ""}
                </li>
              ))}
            </ol>
            <span className={s.sum} style={{ fontWeight: 500 }}>
              {seo.organic.rank == null ? "Votre site n'apparaît pas dans les 20 premiers résultats." : seo.organic.rank <= 3 ? "Vous êtes dans le trio de tête." : `Vous êtes ${seo.organic.rank}e : hors du trio que la plupart des gens regardent.`}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

type Self = { name: string; rating: number | null; reviews: number | null; photos: number | null; hasOrderButton: boolean; hasWebsite: boolean; lat?: number | null; lng?: number | null };

function Neighbors({ comp, self, auditId, isPublic }: { comp: CompetitorsResult; self: Self; auditId: string; isPublic: boolean }) {
  const km = (m: number | null) => (m == null ? "—" : m < 1000 ? `${Math.round(m / 10) * 10} m` : `${fmt(m / 1000, 1)} km`);
  const cellClass = (rank: number | null) => (rank == null || rank > 10 ? s.cellBad : rank <= 3 ? s.cellGood : s.cellMid);
  const map = self.lat != null && self.lng != null ? neighborsMap({ lat: self.lat, lng: self.lng, rating: self.rating }, comp, gridPoints(self.lat, self.lng)) : null;
  const selfRank = comp.grid.find((g) => g.row === 0 && g.col === 0)?.rank ?? null;
  const top3 = comp.grid.filter((g) => g.rank != null && g.rank <= 3).length;
  const outranks = whoOutranks(comp.grid);
  // Le classement tel qu'un client le voit depuis la porte du restaurant.
  const rows: (Self & { distance: number | null; rank: number | null; you?: boolean })[] = [
    { ...self, distance: null, rank: selfRank, you: true },
    ...comp.competitors.map((c: Competitor) => ({ name: c.title, rating: c.rating, reviews: c.reviews, photos: c.totalPhotos, hasOrderButton: c.hasOrderButton, hasWebsite: c.hasWebsite, distance: c.distance, rank: c.rank })),
  ].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const r = comp.rival;
  return (
    <section className={s.section}>
      <div>
        <span className={s.eyebrow}>Face aux voisins</span>
        <h2>Vous et vos concurrents sur Google Maps</h2>
        <p className={s.lead}>Nous avons cherché « {comp.keyword} » dans Google Maps depuis votre porte et depuis 8 points à 700 m autour, comme un client du quartier.</p>
      </div>

      <div className={`${s.card} ${s.mapCard}`}>
        {map ? (
          <NeighborsMapView auditId={auditId} map={map} showSourceError={!isPublic} />
        ) : (
          <div className={s.grid} role="img" aria-label="Rang du restaurant dans Google Maps depuis 9 points autour de lui">
            {comp.grid.map((g) => (
              <div key={`${g.row}${g.col}`} className={`${s.cell} ${cellClass(g.rank)}`}>
                {g.rank ?? "20+"}
                {g.row === 0 && g.col === 0 && <small>vous</small>}
              </div>
            ))}
          </div>
        )}
        <div className={s.mapSide}>
          <div className={s.mapKpi}>
            <span className={s.num}>
              {top3}
              <small>/9</small>
            </span>
            <span>points autour de vous d&apos;où un client qui cherche « {comp.keyword} » vous voit dans les 3 premiers{comp.score.averageRank != null ? ` · rang moyen ${fmt(comp.score.averageRank, 1)}` : ""}.</span>
          </div>
          {map && map.pins.length > 0 && (
            <ol className={s.mapKey}>
              {[...map.pins].sort((a, b) => a.rank - b.rank).map((p) => (
                <li key={p.rank + p.name}>
                  <i className={p.rival ? s.keyRival : undefined}>{p.rank}</i>
                  <span className={s.keyName}>{p.name}</span>
                  <span className={s.keyNum}>{p.rating != null ? `${fmt(p.rating, 1)}★` : "—"} · {(p.reviews ?? 0).toLocaleString("fr-BE")} avis</span>
                </li>
              ))}
            </ol>
          )}
          <ul className={s.legend}>
            <li><i className={s.lgSelf}>Vous</i> votre restaurant, avec votre place depuis votre porte et votre note Google.</li>
            <li><i className={s.lgPin}><b>2</b>4,6★</i> un concurrent : sa place dans Google Maps depuis votre porte, et sa note.</li>
            <li>
              <span className={s.lgDots}><i style={{ background: "#467F3B" }} /><i style={{ background: "#E9C46A" }} /><i style={{ background: "#8A8A82" }} /></span>
              votre place depuis ce point, à 700 m : dans les 3 premiers, de 4 à 10, au-delà.
            </li>
          </ul>
          {outranks.length > 0 && (
            <p className={s.d} style={{ margin: 0 }}>
              Là où vous n&apos;êtes pas dans les 3 premiers, le client voit d&apos;abord{" "}
              {outranks.slice(0, 3).map((o, i) => (
                <span key={o.name}>{i > 0 ? (i === Math.min(outranks.length, 3) - 1 ? " et " : ", ") : ""}<b>{o.name}</b> ({o.times} fois)</span>
              ))}
              .
            </p>
          )}
        </div>
      </div>

      <div className={s.two}>
        <div className={s.card} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <b>Votre note face aux voisins : {comp.score.score}/100</b>
          <div className={s.th}><span>Note Google</span><div className={s.track}><i style={{ width: `${(comp.score.parts.note / 30) * 100}%` }} /></div><span>{comp.score.parts.note}/30</span></div>
          <div className={s.th}><span>Nombre d&apos;avis</span><div className={s.track}><i style={{ width: `${(comp.score.parts.volume / 25) * 100}%` }} /></div><span>{comp.score.parts.volume}/25</span></div>
          <div className={s.th}><span>Rang sur Maps</span><div className={s.track}><i style={{ width: `${(comp.score.parts.rang / 30) * 100}%` }} /></div><span>{comp.score.parts.rang}/30</span></div>
          <div className={s.th}><span>Photos</span><div className={s.track}><i style={{ width: `${(comp.score.parts.photos / 15) * 100}%` }} /></div><span>{comp.score.parts.photos}/15</span></div>
          <span className={s.sum} style={{ fontWeight: 500 }}>
            Médiane des voisins : {comp.score.medianRating != null ? `${fmt(comp.score.medianRating, 1)}★` : "—"}, {comp.score.medianReviews != null ? `${Math.round(comp.score.medianReviews).toLocaleString("fr-BE")} avis` : "—"}, {comp.score.medianPhotos != null ? `${Math.round(comp.score.medianPhotos)} photos` : "—"}.
          </span>
        </div>
      </div>

      {r && (
        <div className={s.card} style={{ display: "flex", flexDirection: "column", gap: 14, borderColor: "var(--olive-2)" }}>
          <div className={s.bar}>
            <div>
              <span className={s.eyebrow}>Votre concurrent n° 1</span>
              <h2 style={{ margin: 0, fontSize: 20 }}>
                {r.title} {isKnownBrand(r.title) && <span className={`${s.tag} ${s.tagFlat}`}>enseigne connue</span>}
              </h2>
            </div>
            <span className={s.sum}>
              {km(r.distance)} · {r.rating != null ? `${fmt(r.rating, 1)}★` : "—"} · {(r.reviews ?? 0).toLocaleString("fr-BE")} avis
            </span>
          </div>
          <p className={s.d} style={{ margin: 0 }}>Le plus proche parmi ceux qui ont le plus de clients : c&apos;est à lui qu&apos;il est le plus facile de prendre des clients.</p>
          {comp.rivalThemes ? (
            <div className={s.two}>
              <div className={s.themeCol}>
                <span className={s.themeHead}><span className={s.dotNeg} aria-hidden="true" /> Ce que ses clients lui reprochent</span>
                {comp.rivalThemes.negatives.slice(0, 4).map((t) => (
                  <div key={t.key} className={`${s.theme} ${s.themeNeg}`}>
                    <div className={s.themeTitle}><b>{t.label}</b><span>{t.count} avis</span></div>
                    {t.example && <p className={s.quote}>« {t.example} »</p>}
                  </div>
                ))}
                {comp.rivalThemes.negatives.length === 0 && <p className={s.d}>Aucun reproche récurrent dans ses 100 derniers avis.</p>}
              </div>
              <div className={s.themeCol}>
                <span className={s.themeHead}><span className={s.dotPos} aria-hidden="true" /> Ce qu&apos;ils aiment chez lui</span>
                {comp.rivalThemes.positives.slice(0, 3).map((t) => (
                  <div key={t.key} className={`${s.theme} ${s.themePos}`}>
                    <div className={s.themeTitle}><b>{t.label}</b><span>{t.count} avis</span></div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            !isPublic && comp.rivalError && <p className={s.notice}>Avis du concurrent non analysés : {comp.rivalError}</p>
          )}
          {comp.attack.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <b>Comment lui prendre des clients</b>
              {comp.attack.map((a, i) => (
                <article key={a.title} className={s.prio}>
                  <span className={s.n}>{i + 1}</span>
                  <h3>{a.title}</h3>
                  <p className={s.d}>{a.why}</p>
                  <div>
                    <ul>{a.steps.map((x) => <li key={x}>{x}</li>)}</ul>
                  </div>
                </article>
              ))}
            </div>
          )}
          {!isPublic && comp.attackError && <p className={s.notice}>Plan d&apos;attaque non généré : {comp.attackError}</p>}
        </div>
      )}

      <div className={s.card} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <b>Le classement vu depuis votre porte</b>
        <div className={s.scroll}>
          <table className={s.table}>
            <thead>
              <tr><th>Place</th><th>Établissement</th><th>Distance</th><th>Note</th><th>Avis</th><th>Photos</th><th>Commander</th><th>Site</th></tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.name + (x.you ? "-vous" : "")} className={x.you ? s.rowYou : undefined}>
                  <td>{x.rank ?? "20+"}</td>
                  <td>{x.you ? `${x.name} (vous)` : x.name}</td>
                  <td>{x.you ? "—" : km(x.distance)}</td>
                  <td>{x.rating != null ? `${fmt(x.rating, 1)}★` : "—"}</td>
                  <td>{x.reviews != null ? x.reviews.toLocaleString("fr-BE") : "—"}</td>
                  <td>{x.photos ?? "—"}</td>
                  <td>{x.hasOrderButton ? "✓" : "—"}</td>
                  <td>{x.hasWebsite ? "✓" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}


function Themes({ themes }: { themes: ReviewThemes }) {
  if (!themes.negatives.length && !themes.positives.length) return null;
  return (
    <div className={s.two}>
      <div className={s.themeCol}>
        <span className={s.themeHead}>
          <span className={s.dotNeg} aria-hidden="true" /> À améliorer
        </span>
        {themes.negatives.length === 0 && <p className={s.d}>Aucun reproche ne revient dans les avis lus.</p>}
        {themes.negatives.map((t) => (
          <div key={t.key} className={`${s.theme} ${s.themeNeg}`}>
            <div className={s.themeTitle}>
              <b>{t.label}</b>
              <span>
                {t.count} avis · {pct(t.share)} des 1–3★{t.recent ? ` · ${t.recent} ces 6 mois` : ""}
              </span>
            </div>
            {t.example && <p className={s.quote}>« {t.example} »</p>}
            <div className={s.advice}>{t.advice ? <><b>Comment le régler :</b> {t.advice}</> : <b>La solution est évidente : la faire, et le dire dans les réponses aux avis.</b>}</div>
          </div>
        ))}
      </div>
      <div className={s.themeCol}>
        <span className={s.themeHead}>
          <span className={s.dotPos} aria-hidden="true" /> Vos points forts
        </span>
        {themes.positives.map((t) => (
          <div key={t.key} className={`${s.theme} ${s.themePos}`}>
            <div className={s.themeTitle}>
              <b>{t.label}</b>
              <span>
                {t.count} avis · {pct(t.share)} des 4–5★
              </span>
            </div>
            {t.example && <p className={s.quote}>« {t.example} »</p>}
            {t.advice && (
              <div className={s.advice}>
                <b>Comment capitaliser :</b> {t.advice}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Topics({ themes, topics }: { themes: ReviewThemes | null; topics: Record<string, number> | null }) {
  const list = themes?.topics.length
    ? themes.topics
    : Object.entries(topics ?? {}).map(([keyword, count]) => ({ keyword, count, sentiment: "neutre" as const, detail: null }));
  if (!list.length) return null;
  return (
    <div className={s.col}>
      <b>Ce que les clients citent le plus</b>
      <div className={s.topics}>
        {[...list]
          .sort((a, b) => b.count - a.count)
          .slice(0, 14)
          .map((t) =>
            t.sentiment === "negatif" && t.detail ? (
              <details key={t.keyword} className={s.topicDetails}>
                <summary className={`${s.chip} ${s.chipNeg}`}>
                  {t.keyword} · {t.count} ▾
                </summary>
                <div className={s.topicDetail}>{t.detail}</div>
              </details>
            ) : (
              <span key={t.keyword} className={`${s.chip} ${t.sentiment === "positif" ? s.chipPos : t.sentiment === "negatif" ? s.chipNeg : ""}`}>
                {t.keyword} · {t.count}
              </span>
            ),
          )}
      </div>
      <span className={s.sum} style={{ fontWeight: 500 }}>
        Mots repérés par Google dans les avis{themes ? " : en vert quand les clients en parlent en bien, en rouge quand ils s'en plaignent (touchez un mot rouge pour le détail)." : "."}
      </span>
    </div>
  );
}

function Distribution({ dist }: { dist: Record<string, number> | null }) {
  if (!dist) return null;
  const total = Object.values(dist).reduce((a, b) => a + b, 0);
  if (!total) return null;
  return (
    <div className={s.col}>
      <b>Répartition des notes</b>
      {["5", "4", "3", "2", "1"].map((k) => {
        const n = dist[k] ?? 0;
        return (
          <div key={k} className={s.th}>
            <span>{k}★</span>
            <div className={s.track}>
              <i style={{ width: `${(n / total) * 100}%`, background: Number(k) >= 4 ? "#467F3B" : "#9E6612" }} />
            </div>
            <span>{Math.round((n / total) * 100)} %</span>
          </div>
        );
      })}
    </div>
  );
}

function Revision({ answers, reco }: { answers: OwnerAnswers; reco: StoredRecommendations | null }) {
  const gap = answers.monthlyRevenue && answers.monthlyRevenueTarget ? answers.monthlyRevenueTarget - answers.monthlyRevenue : null;
  const eur = (n: number) => `${n.toLocaleString("fr-BE", { maximumFractionDigits: 0 })} €`;
  const objective = reco?.objective ?? null;
  const changes = reco?.revision?.changes ?? [];
  return (
    <section id="revision" className={s.section}>
      {answers.monthlyRevenue && answers.monthlyRevenueTarget && gap != null && (
        <>
          <div>
            <span className={s.eyebrow}>Votre objectif</span>
            <h2>
              De {eur(answers.monthlyRevenue)} à {eur(answers.monthlyRevenueTarget)} par mois
            </h2>
            <p className={s.lead}>
              {gap > 0 ? `+${eur(gap)} par mois, soit +${Math.round((gap / answers.monthlyRevenue) * 100)} %.` : "L'objectif est déjà atteint."}{" "}
              {objective?.diagnostic}
            </p>
          </div>
          <div className={s.card} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className={s.goalBar}>
              <div className={s.goalNow} style={{ width: `${Math.min(100, (answers.monthlyRevenue / answers.monthlyRevenueTarget) * 100)}%` }}>
                {eur(answers.monthlyRevenue)} aujourd&apos;hui
              </div>
              <span className={s.goalTarget}>{eur(answers.monthlyRevenueTarget)}</span>
            </div>
            {objective && (
              <ul className={s.d} style={{ margin: 0, paddingLeft: 18, listStyle: "disc" }}>
                {objective.steps.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            )}
            {objective?.boosteats && (
              <div className={s.boost} style={{ gridColumn: "auto", margin: 0 }}>
                <b>Comment Boosteats aide.</b> {objective.boosteats}
              </div>
            )}
          </div>
        </>
      )}
      {changes.length > 0 && (
        <div className={`${s.card} ${s.changes}`}>
          <b>Ce que vos réponses ont changé</b>
          <ul>
            {changes.map((c) => (
              <li key={c.scenario.id + c.kind}>
                {c.kind === "ajoutee" && <span className={`${s.tag} ${s.tagNew}`}>Nouveau · n° {c.rank}</span>}
                {c.kind === "deplacee" && <span className={`${s.tag} ${c.to < c.from ? s.tagUp : s.tagFlat}`}>{c.from} → {c.to}</span>}
                {c.kind === "retiree" && <span className={`${s.tag} ${s.tagFlat}`}>Au calendrier</span>} <b>{c.scenario.title}</b>
              </li>
            ))}
            {(reco?.revision?.newlyMatched ?? 0) > 0 && (
              <li>
                <span className={`${s.tag} ${s.tagFlat}`}>+ {reco!.revision!.newlyMatched}</span> actions ajoutées au calendrier grâce à vos réponses.
              </li>
            )}
          </ul>
        </div>
      )}
    </section>
  );
}

// Le rapport se termine par ce que Boosteats fait pour ce restaurant : A + B,
// le résultat, trois étapes concrètes, et UN seul appel à l'action (le plan
// Gratuit, ADR 0070). Rien n'est promis que le plan Gratuit ne fasse pas :
// fidélité, parrainage, messages aux clients, suivi des retours.
function BoosteatsPlan({ name, top, answers, now, potential }: { name: string; top: Scenario[]; answers: OwnerAnswers | null; now: number | null; potential: number | null }) {
  const eur = (n: number) => `${n.toLocaleString("fr-BE", { maximumFractionDigits: 0 })} €`;
  const goal = answers?.monthlyRevenue && answers.monthlyRevenueTarget && answers.monthlyRevenueTarget > answers.monthlyRevenue ? answers : null;
  const levers = top.map((p, i) => ({ n: i + 1, p })).filter((x) => x.p.boosteats);
  const href = "/become-a-partner?source=audit";
  return (
    <section id="boosteats" className={`${s.section} ${s.plan2}`}>
      <div>
        <span className={s.eyebrow}>Et maintenant</span>
        <h2>Ce que Boosteats fait pour {name}</h2>
        <p className={s.lead}>
          {goal
            ? `Votre objectif : passer de ${eur(goal.monthlyRevenue!)} à ${eur(goal.monthlyRevenueTarget!)} par mois. Les priorités ci-dessus vous amènent de nouveaux clients ; Boosteats fait revenir ceux que vous avez déjà.`
            : now != null && potential != null && potential > now
              ? "Les priorités ci-dessus vous amènent de nouveaux clients. Boosteats s'occupe de ceux qui vous ont déjà trouvé : qu'ils reviennent, et qu'ils en amènent d'autres."
              : "Boosteats s'occupe des clients qui vous ont déjà trouvé : qu'ils reviennent plus souvent, et qu'ils en amènent d'autres."}
        </p>
      </div>

      <div className={s.equation}>
        <div className={s.term}>
          <span className={s.termKey}>A</span>
          <h3>Vos clients reviennent</h3>
          <p>Un programme de fidélité à votre nom et à vos couleurs. Le client prend son ticket en photo, gagne des points et choisit son cadeau dans votre carte. Le coût des cadeaux reste un petit pourcentage de ce que ces clients dépensent chez vous : votre marge est protégée.</p>
        </div>
        <span className={s.op} aria-hidden="true">+</span>
        <div className={s.term}>
          <span className={s.termKey}>B</span>
          <h3>Ils en amènent d&apos;autres</h3>
          <p>Chaque client invite ses amis par WhatsApp et forme une équipe avec eux. Vous voyez qui revient et combien de fois, et vous leur écrivez en un geste quand vous avez une nouveauté.</p>
        </div>
        <span className={s.op} aria-hidden="true">=</span>
        <div className={`${s.term} ${s.termResult}`}>
          <span className={s.termKey}>✓</span>
          <h3>{goal ? `Cap sur ${eur(goal.monthlyRevenueTarget!)} par mois` : "Plus de visites, sans commission"}</h3>
          <p>Des clients qui reviennent plus souvent, au comptoir, sans payer de commission à une plateforme. Et chaque mois, le chiffre pour le prouver.</p>
        </div>
      </div>

      {levers.length > 0 && (
        <div className={s.card} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <b>Dans votre plan, Boosteats agit directement sur :</b>
          <ul className={s.levers}>
            {levers.map(({ n, p }) => (
              <li key={p.id}>
                <span className={s.n}>{n}</span>
                <span>
                  <b>{p.title}.</b> {p.boosteats}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={s.card} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <b>Concrètement, dans votre restaurant</b>
        <ul className={s.levers}>
          {[
            ["On prépare tout avec vous.", "Le QR code pour le comptoir, l'affiche à imprimer, les cadeaux choisis dans votre carte."],
            ["Vos clients prennent leur ticket en photo.", "Pas d'application à télécharger : le QR code, une photo, les points arrivent."],
            ["Chaque mois, vous voyez ce que ça rapporte.", "Combien de clients sont revenus, combien de tickets, ce qu'ils ont dépensé chez vous."],
          ].map(([title, text], i) => (
            <li key={title}>
              <span className={s.n}>{i + 1}</span>
              <span>
                <b>{title}</b> {text}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className={s.ctaBlock}>
        <TrackedLink ctaId="devenir_partenaire" ctaLocation="rapport_audit" audience="restaurateur" href={href} className={s.ctaBig}>
          Démarrer gratuitement dans mon restaurant
        </TrackedLink>
        <span className={s.sum} style={{ fontWeight: 500 }}>Gratuit jusqu&apos;à 500 tickets par mois, sans engagement.</span>
        <span className={`${s.sum} ${s.printOnly}`}>boosteats.tech/become-a-partner</span>
      </div>
    </section>
  );
}
