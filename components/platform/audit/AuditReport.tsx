import Link from "next/link";
import type { AuditRow, SectionRow } from "@/lib/audit/store";
import type { BusinessInfo, StoredReview } from "@/lib/audit/dataforseo";
import type { FicheScore } from "@/lib/audit/fiche-score";
import type { ReviewsResultSummary } from "@/lib/audit/measure";
import type { Recommendations } from "@/lib/audit/recommend";
import type { Change } from "@/lib/audit/revise";
import type { Scenario } from "@/lib/audit/scenarios";
import type { AuditSignals, OwnerAnswers } from "@/lib/audit/signals";
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
  type ActionKey,
  type CardModel,
} from "@/lib/audit/report-model";
import { AnswersForm } from "./AnswersForm";
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

export function AuditReport({ audit, sections, saveAnswers }: { audit: AuditRow; sections: SectionRow[]; saveAnswers: (fd: FormData) => void }) {
  const byKey = Object.fromEntries(sections.map((x) => [x.section, x])) as Partial<Record<SectionRow["section"], SectionRow>>;
  const info = byKey.fiche?.status === "ok" ? (byKey.fiche.raw as Info) : null;
  const fiche = byKey.fiche?.status === "ok" ? (byKey.fiche.result as FicheScore) : null;
  const avis = byKey.avis?.status === "ok" ? (byKey.avis.result as ReviewsResultSummary) : null;
  const reviews = byKey.avis?.status === "ok" ? ((byKey.avis.raw as { reviews?: StoredReview[] })?.reviews ?? []) : [];
  const reco = audit.recommendations as StoredRecommendations | null;
  const signals = audit.signals as AuditSignals | null;
  const answers = audit.answers as OwnerAnswers | null;
  const scores = (audit.scores ?? {}) as { fiche?: number | null; avis?: number | null };

  const rating = info?.rating?.value ?? null;
  const potentials = {
    fiche: fiche ? fichePotential(fiche) : null,
    avis: avis ? avisPotential(rating, avis, signals?.trend ?? null) : null,
  };
  const global = globalScores({ fiche: scores.fiche ?? null, avis: scores.avis ?? null }, potentials);
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
        <div className={s.bar}>
          <Link href="/platform/audit" className={s.back}>← Tous les audits</Link>
          <span className={s.logo}>boost<b>eats</b> · audit</span>
        </div>

        {audit.status === "en_cours" && <p className={s.notice}>Mesure en cours (1 à 4 minutes) : la page se met à jour toute seule.</p>}
        {fiche?.approximate && (
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
            <ScoreTile label="Fiche Google" now={scores.fiche ?? null} potential={potentials.fiche} note={fiche ? `sur ${fiche.verified} critères vérifiés` : byKey.fiche?.error ?? null} />
            <ScoreTile label="Avis" now={scores.avis ?? null} potential={potentials.avis} note={avis ? `${avis.read} avis lus sur ${avis.total ?? "?"}` : byKey.avis?.error ?? null} />
            <ScoreTile label="Face aux voisins" now={null} potential={null} note="Bientôt dans l'audit" />
            <ScoreTile label="Réseaux sociaux" now={null} potential={null} note="Bientôt dans l'audit" />
          </div>
        </section>

        {/* 3. Le quartier (en attendant le volet Concurrents : les fiches que Google propose à côté) */}
        {info?.people_also_search && info.people_also_search.length > 0 && (
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
            <div className={s.two}>
              <Distribution dist={info?.rating_distribution ?? avis.distribution} />
              {info?.place_topics && Object.keys(info.place_topics).length > 0 && (
                <div className={s.col}>
                  <b>Ce que les clients citent le plus</b>
                  <div className={s.topics}>
                    {Object.entries(info.place_topics)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 12)
                      .map(([k, v]) => (
                        <span key={k} className={s.chip}>
                          {k} · {v}
                        </span>
                      ))}
                  </div>
                  <span className={s.sum} style={{ fontWeight: 500 }}>Mots repérés par Google dans les avis. L&apos;analyse des thèmes positifs et négatifs arrive dans une prochaine version.</span>
                </div>
              )}
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

        {/* 8. Approfondir */}
        {audit.status !== "en_cours" && <AnswersForm action={saveAnswers} initial={answers} />}

        {/* Console seulement : l'état de chaque volet, avec son motif (jamais d'échec silencieux). */}
        <details className={s.tech}>
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
        </details>
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
