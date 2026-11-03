"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, ChevronDown } from "lucide-react";
import { Reveal } from "./motion";
import { KRAAINEM_CASE as C, euros } from "@/lib/case-studies";

// Section 2 de l'accueil (2026-11-03, demande de Mehdi, sur le modèle des
// onglets d'owner.com) : la méthode en roue. Acquisition (faire venir) →
// Rétention (faire revenir) → Optimisation (garder ce qui marche), et le
// Résultat : le chiffre d'affaires du restaurant, au centre de la roue.
// La roue est le cœur de la section : chaque arc est cliquable, comme les
// onglets au-dessus, qui avancent seuls tant que le visiteur n'a rien touché
// (jamais avec prefers-reduced-motion, jamais hors de l'écran). Chaque outil
// s'ouvre pour montrer son détail.
// Seulement des outils RÉELS ; ce qui n'est pas livré porte « pilote » (le site
// de référencement, ADR 0088). Jamais « grâce à nous » (ADR 0064) : la preuve
// est le cas Kraainem, ce qu'on a fait ensemble. « SEO » est interdit sur le
// site public (lib/marketing-pages.test.ts) : on dit « référencement Google ».

type Tool = { name: string; tag?: string; detail: string; href?: string };
type Stage = {
  key: string;
  label: string;
  tab: string;
  title: string;
  color: string;
  ink: string;
  tools: Tool[];
};

const STAGES: Stage[] = [
  {
    key: "acquisition",
    label: "Acquisition",
    tab: "Plus de nouveaux clients",
    title: "Qu'on vous trouve sur Google, et que le quartier vous voie.",
    color: "#83A115",
    ink: "#FFFFFF",
    tools: [
      {
        name: "Référencement Google",
        tag: "Pro · pilote",
        detail:
          "Un site à votre nom, fait depuis votre carte : vos plats phares, vos horaires, votre promo du moment. Il est pensé pour sortir quand on cherche « burger » ou « poulet » dans votre quartier. Son bouton mène à votre commande, à votre téléphone ou à l'itinéraire.",
        href: "/visibilite-restaurant",
      },
      {
        name: "Votre fiche Google tenue à jour",
        tag: "Pro",
        detail:
          "Photos, horaires, carte et promos à jour sur votre fiche, celle que les gens voient en premier sur Google Maps.",
        href: "/fiche-google-restaurant",
      },
      {
        name: "Pub Facebook et Instagram dans le quartier",
        detail:
          "À 3 km autour de chez vous. Une estimation avant de payer, et un mot clé à dire au comptoir pour reconnaître ceux qui viennent de la pub.",
        href: "/publicite-restaurant",
      },
      {
        name: "Une réponse à chaque avis Google",
        tag: "Croissance et Pro",
        detail: "On répond à vos avis pour vous. Une fiche qui répond donne confiance à ceux qui hésitent encore.",
        href: "/analyse-avis-google-restaurant",
      },
    ],
  },
  {
    key: "retention",
    label: "Rétention",
    tab: "Plus de clients qui reviennent",
    title: "Que celui qui est venu une fois revienne.",
    color: "#A2C523",
    ink: "#0A0A0A",
    tools: [
      {
        name: "Le programme de fidélité",
        detail:
          "Le client prend son ticket de caisse en photo, gagne des points et choisit son cadeau. Vous récupérez son contact. Rien à brancher : le ticket de caisse suffit.",
        href: "/programme-fidelite-restaurant",
      },
      {
        name: "Un message quand un habitué décroche",
        detail: "Quand un habitué laisse passer son rythme, un message part tout seul pour lui donner une raison de revenir.",
        href: "/relancer-vos-clients",
      },
      {
        name: "Vos promos envoyées à vos clients",
        detail: "Une nouvelle promo ? Vous l'envoyez à vos clients inscrits en quelques secondes, ou vous la programmez à l'avance.",
      },
      {
        name: "Le parrainage par WhatsApp",
        detail: "Vos clients partagent leur lien sur WhatsApp et sont récompensés quand un ami s'inscrit.",
      },
    ],
  },
  {
    key: "optimisation",
    label: "Optimisation",
    tab: "Plus de ce qui marche",
    title: "Garder ce qui marche, corriger le reste.",
    color: "#0A0A0A",
    ink: "#FFFFFF",
    tools: [
      {
        name: "Votre chiffre du jour",
        detail:
          "Caisse et plateformes, comparées aux mêmes jours des semaines passées. Vous voyez tout de suite les jours qui faiblissent.",
        href: "/chiffre-affaires-restaurant",
      },
      {
        name: "Le coût de chaque plat",
        detail:
          "Chaque cadeau est calculé sur ce qu'il vous coûte, au taux que vous choisissez : la fidélité ne mange pas votre marge.",
        href: "/food-cost-restaurant",
      },
      {
        name: "La pub mesurée",
        detail: "L'estimation avant de payer, puis le réel : combien de personnes touchées et ce que ça a coûté.",
        href: "/publicite-restaurant",
      },
      {
        name: "Un rapport chaque mois",
        tag: "Pro",
        detail: "Votre place sur Google Maps dans le quartier, les visites venues de Google, ce qu'on a fait et ce qu'on change.",
      },
    ],
  },
];

const RESULT = { key: "resultat", label: "Résultat", tab: "Plus de chiffre d'affaires" };
const TABS = [...STAGES.map((s) => ({ key: s.key, label: s.label, tab: s.tab })), RESULT];
const AUTO_MS = 7000;

// Géométrie de la roue (viewBox 400 × 400). Angles en degrés, 0° = 3 h, sens
// horaire (repère SVG). Chaque arc couvre un tiers moins un écart et finit par
// une pointe de flèche vers l'étape suivante.
const CX = 200;
const CY = 200;
const R = 140;
const BAND = 46;
const GAP = 7;

const rad = (d: number) => (d * Math.PI) / 180;
const pt = (d: number, r = R) => [CX + r * Math.cos(rad(d)), CY + r * Math.sin(rad(d))] as const;
const f = (n: number) => n.toFixed(1);

function arcPath(a0: number, a1: number, reverse = false) {
  const [x0, y0] = pt(reverse ? a1 : a0);
  const [x1, y1] = pt(reverse ? a0 : a1);
  return `M ${f(x0)} ${f(y0)} A ${R} ${R} 0 0 ${reverse ? 0 : 1} ${f(x1)} ${f(y1)}`;
}

function arrowHead(a: number) {
  const [ex, ey] = pt(a);
  const nx = Math.cos(rad(a));
  const ny = Math.sin(rad(a));
  const w = BAND / 2 + 7;
  const tip = [ex - ny * 20, ey + nx * 20];
  return `${f(ex + nx * w)},${f(ey + ny * w)} ${f(tip[0])},${f(tip[1])} ${f(ex - nx * w)},${f(ey - ny * w)}`;
}

function Wheel({ active, onPick }: { active: number; onPick: (i: number) => void }) {
  const result = active === STAGES.length;
  return (
    <svg
      viewBox="-10 -10 420 420"
      className="w-full max-w-[300px] sm:max-w-[400px] h-auto mx-auto select-none"
      role="img"
      aria-label="Trois étapes, acquisition, rétention et optimisation, qui tournent autour du chiffre d'affaires du restaurant."
    >
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="#E6E1D8" strokeWidth={BAND} />
      {STAGES.map((s, i) => {
        const a0 = -90 + i * 120 + GAP;
        const a1 = -90 + (i + 1) * 120 - GAP - 8;
        const mid = (a0 + a1) / 2;
        // Texte à l'endroit : sur la moitié basse de la roue, son chemin est inversé.
        const bottom = Math.sin(rad(mid)) > 0.3;
        const on = active === i || result;
        const push = active === i ? 10 : 0;
        return (
          <g
            key={s.key}
            onClick={() => onPick(i)}
            className="cursor-pointer"
            style={{
              opacity: on ? 1 : 0.32,
              transform: `translate(${f(Math.cos(rad(mid)) * push)}px, ${f(Math.sin(rad(mid)) * push)}px)`,
              transition: "opacity 300ms ease, transform 300ms ease",
            }}
          >
            <path d={arcPath(a0, a1)} fill="none" stroke={s.color} strokeWidth={BAND} />
            <polygon points={arrowHead(a1)} fill={s.color} />
            <path id={`roue-texte-${i}`} d={arcPath(a0, a1, bottom)} fill="none" />
            <text fill={s.ink} fontSize="15" fontWeight="700" letterSpacing="0.06em" dy="5" style={{ textTransform: "uppercase" }}>
              <textPath href={`#roue-texte-${i}`} startOffset="50%" textAnchor="middle">
                {`${i + 1} · ${s.label}`}
              </textPath>
            </text>
          </g>
        );
      })}
      {/* Centre (retour de Mehdi, 2026-11-03) : un rond blanc doux, une courbe
          qui monte et le chiffre d'affaires en toutes lettres — plus de disque noir. */}
      <defs>
        <filter id="roue-ombre" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="6" stdDeviation="9" floodColor="#0A0A0A" floodOpacity="0.08" />
        </filter>
        <linearGradient id="roue-aire" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#A2C523" stopOpacity={result ? 0.45 : 0.28} />
          <stop offset="100%" stopColor="#A2C523" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g onClick={() => onPick(STAGES.length)} className="cursor-pointer">
        <circle
          cx={CX}
          cy={CY}
          r={92}
          fill="#FFFFFF"
          stroke={result ? "#A2C523" : "#ECE8E0"}
          strokeWidth={result ? 3 : 1.5}
          filter="url(#roue-ombre)"
          style={{ transition: "stroke 300ms ease" }}
        />
        <path
          d={`M ${CX - 52} ${CY - 2} C ${CX - 30} ${CY - 2}, ${CX - 22} ${CY - 18}, ${CX - 4} ${CY - 22} S ${CX + 30} ${CY - 34}, ${CX + 52} ${CY - 58} L ${CX + 52} ${CY - 2} Z`}
          fill="url(#roue-aire)"
        />
        <path
          d={`M ${CX - 52} ${CY - 2} C ${CX - 30} ${CY - 2}, ${CX - 22} ${CY - 18}, ${CX - 4} ${CY - 22} S ${CX + 30} ${CY - 34}, ${CX + 52} ${CY - 58}`}
          fill="none"
          stroke="#83A115"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <circle cx={CX + 52} cy={CY - 58} r="5.5" fill="#83A115" />
        <text x={CX} y={CY + 30} textAnchor="middle" fill="#0A0A0A" fontSize="17" fontWeight="700">
          Votre chiffre
        </text>
        <text x={CX} y={CY + 51} textAnchor="middle" fill="#0A0A0A" fontSize="17" fontWeight="700">
          d&apos;affaires
        </text>
      </g>
    </svg>
  );
}

function ToolList({ stage }: { stage: Stage }) {
  const [open, setOpen] = useState(0);
  return (
    <div>
      <ul className="divide-y divide-paper-border border-y border-paper-border">
        {stage.tools.map((t, i) => {
          const isOpen = open === i;
          return (
            <li key={t.name}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? -1 : i)}
                aria-expanded={isOpen}
                className="w-full flex items-center gap-3 py-3.5 text-left"
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: stage.color === "#0A0A0A" ? "#83A115" : stage.color }} />
                <span className="flex-1 min-w-0 text-[16px] font-semibold text-ink">
                  {t.name}
                  {t.tag && (
                    <span className="ml-2 inline-block align-middle text-[11.5px] font-semibold text-moss-dark bg-moss-tint rounded-full px-2 py-0.5 whitespace-nowrap">
                      {t.tag}
                    </span>
                  )}
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-ink-muted shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>
              <div className={`grid transition-[grid-template-rows] duration-300 ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                <div className="overflow-hidden">
                  <p className="text-[15px] leading-[1.6] text-ink-body m-0 pl-5 pb-4">
                    {t.detail}
                    {t.href && (
                      <>
                        {" "}
                        <Link href={t.href} className="inline-flex items-center gap-1 font-semibold text-ink hover:text-moss-dark">
                          En savoir plus <ArrowRight className="w-3.5 h-3.5" aria-hidden />
                        </Link>
                      </>
                    )}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>    </div>
  );
}

// Le but, tour après tour : des marches qui montent. Aucune valeur inventée,
// le seul chiffre est celui du cas Kraainem (accord du propriétaire).
const TURNS = [38, 58, 80, 100];

function ResultPanel() {
  return (
    <div>
      <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-moss-dark m-0">▶ Tour après tour</p>
      <h3 className="font-display text-[26px] sm:text-[32px] leading-[1.15] tracking-[-0.02em] font-bold text-ink mt-3 mb-0 text-pretty">
        Plus de clients qui viennent, plus de clients qui reviennent : le chiffre d&apos;affaires monte.
      </h3>
      <div className="flex items-end gap-3 h-[140px] mt-7" aria-hidden>
        {TURNS.map((h, i) => (
          <div key={h} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
            <div
              className="w-full rounded-t-xl"
              style={{ height: `${h}%`, background: i === TURNS.length - 1 ? "#A2C523" : `rgba(131,161,21,${0.25 + i * 0.18})` }}
            />
            <span className="text-[12px] text-ink-muted whitespace-nowrap">{i === 0 ? "1er tour" : `${i + 1}e tour`}</span>
          </div>
        ))}
      </div>
      <a
        href="#cas-client"
        className="inline-flex items-center gap-1.5 mt-6 text-[15px] font-semibold text-ink hover:text-moss-dark transition-colors"
      >
        À Kraainem : de {euros(C.before)} à {euros(C.after)} par mois <ArrowUpRight className="w-4 h-4" aria-hidden />
      </a>
    </div>
  );
}

export function LoopSection() {
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLElement>(null);

  // Défilement automatique : seulement à l'écran, jamais avec reduced-motion,
  // et arrêté dès que le visiteur choisit lui-même.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setAuto(false);
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!auto || !inView) return;
    const t = setTimeout(() => setActive((a) => (a + 1) % TABS.length), AUTO_MS);
    return () => clearTimeout(t);
  }, [active, auto, inView]);

  const pick = (i: number) => {
    setAuto(false);
    setActive(i);
  };

  const stage = STAGES[active];

  return (
    <section ref={ref} id="methode" className="bg-paper py-20 sm:py-24 scroll-mt-16">
      <style>{`@keyframes roue-progres{from{width:0}to{width:100%}}@keyframes roue-apparait{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}`}</style>
      <div className="max-w-[1200px] mx-auto px-5 sm:px-8">
        <Reveal>
          <div className="text-center max-w-[760px] mx-auto">
            <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-moss-dark mb-3.5">▶ Notre méthode</p>
            <h2 className="font-display text-[32px] sm:text-[42px] lg:text-[50px] leading-[1.12] tracking-[-0.025em] font-bold text-ink text-pretty">
              Trois étapes pour faire grimper votre chiffre d&apos;affaires.
            </h2>
            <p className="font-landing text-[17px] leading-[1.65] text-ink-muted mt-4 mx-auto max-w-[620px] text-pretty">
              On fait venir de nouveaux clients, on les fait revenir, puis on garde ce qui marche. Chaque tour nourrit
              le suivant.
            </p>
          </div>
        </Reveal>

        <div role="tablist" aria-label="Les trois étapes" className="mt-10 grid grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-4 items-end">
          {TABS.map((t, i) => {
            const on = active === i;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls="roue-panneau"
                onClick={() => pick(i)}
                className="text-left group"
              >
                <span className={`block text-[12px] font-semibold uppercase tracking-[0.08em] ${on ? "text-moss-dark" : "text-ink-faint"}`}>
                  {i < STAGES.length ? `${i + 1} · ${t.label}` : t.label}
                </span>
                <span
                  className={`block font-display text-[17px] sm:text-[21px] font-bold leading-tight mt-1 transition-colors ${on ? "text-ink" : "text-ink-faint group-hover:text-ink-muted"}`}
                >
                  {t.tab}
                </span>
                <span className="block h-[3px] mt-3 rounded-full bg-paper-border overflow-hidden">
                  {on && (
                    <span
                      key={`${active}-${auto && inView}`}
                      className="block h-full bg-moss-dark rounded-full"
                      style={auto && inView ? { animation: `roue-progres ${AUTO_MS}ms linear forwards` } : { width: "100%" }}
                    />
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-6 rounded-[28px] bg-paper-subtle border border-paper-border px-5 sm:px-10 py-8 sm:py-12 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-8 lg:gap-14 items-center">
          <Wheel active={active} onPick={pick} />
          <div id="roue-panneau" role="tabpanel" key={active} className="min-w-0 [animation:roue-apparait_300ms_ease]">
            {stage ? (
              <>
                <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-moss-dark m-0">
                  ▶ Étape {active + 1} · {stage.label}
                </p>
                <h3 className="font-display text-[26px] sm:text-[32px] leading-[1.15] tracking-[-0.02em] font-bold text-ink mt-3 mb-6 text-pretty">
                  {stage.title}
                </h3>
                <ToolList stage={stage} />
              </>
            ) : (
              <ResultPanel />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
