"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, Calculator, Gauge, Location, type IconProps } from "@/components/icons";
import { KRAAINEM_CASE as C, euros } from "@/lib/case-studies";
import type { Plan } from "@/lib/entitlements";
import { Portrait } from "./Portrait";
import { BRIGADE, PLAN_LABEL } from "./brigade";
import { PHOTOS } from "./IPhone";

// Menu « La brigade » de l'en-tête (ex-« Notre offre » du 2026-11-03, sur le
// modèle d'owner.com). Brigade 17 (maquette du 2026-11-04) : les fonctions sont
// rangées par assistant et par forfait (ADR 0089 §1), chacune reliée à sa page ;
// Nina et Max portent « Pilote » (ADR 0070, 0088). Les pages qui ne sont le
// poste de personne restent sous « Et aussi ». À droite, le cas Kraainem
// (accord du propriétaire) : jamais « grâce à nous ».

type Tool = { label: string; href: string; Icon: (p: IconProps) => React.ReactElement };

const TOOLS: Tool[] = [
  { label: "Analyse gratuite", href: "/audit-gratuit", Icon: Gauge },
  { label: "Fiche Google", href: "/fiche-google-restaurant", Icon: Location },
  { label: "Coût de chaque plat", href: "/food-cost-restaurant", Icon: Calculator },
];

const byPlan = (plan: Plan) => BRIGADE.filter((a) => a.plan === plan);

export function OfferMenu() {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Moment de l'ouverture au survol : un clic qui suit de près ne doit pas
  // refermer le menu que la souris vient d'ouvrir.
  const hoveredAt = useRef(0);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  // Survol : ouvre tout de suite, ferme avec un léger délai (le temps de
  // descendre du bouton au panneau).
  const enter = () => {
    clearTimeout(closeTimer.current);
    if (!open) hoveredAt.current = Date.now();
    setOpen(true);
  };
  const leave = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };
  const close = () => setOpen(false);

  return (
    <div ref={wrap} className="relative" onMouseEnter={enter} onMouseLeave={leave}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="menu-offre"
        onClick={() => setOpen((o) => (o && Date.now() - hoveredAt.current < 600 ? true : !o))}
        className={`flex items-center gap-1 text-[13px] xl:text-[15px] font-medium whitespace-nowrap transition-colors ${open ? "text-white" : "text-night-text hover:text-white"}`}
      >
        La brigade
        <ArrowDown size={16} className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      <div
        id="menu-offre"
        className={`fixed left-1/2 top-16 -translate-x-1/2 pt-2 transition-[opacity,transform,visibility] duration-200 ${
          open ? "visible opacity-100 translate-y-0 pointer-events-auto" : "invisible opacity-0 -translate-y-1 pointer-events-none"
        }`}
      >
        <div className="w-[min(880px,calc(100vw-32px))] bg-white rounded-lg shadow-[0_8px_24px_rgba(12,21,9,0.1)] border border-paper-border p-8 grid grid-cols-[1fr_1fr] lg:grid-cols-[1fr_1fr_256px] gap-8">
          <AssistantGroup plan="gratuit" onPick={close} />
          <div className="space-y-7 border-r border-paper-border pr-8">
            <AssistantGroup plan="croissance" onPick={close} />
            <AssistantGroup plan="pro" onPick={close} />
            <div>
              <p className="text-[13px] font-medium text-ink-muted m-0 mb-2">Et aussi</p>
              <ul className="space-y-0.5 list-none p-0 m-0">
                {TOOLS.map(({ label, href, Icon }) => (
                  <li key={label}>
                    <Link
                      href={href}
                      onClick={close}
                      className="flex items-center gap-3 -mx-2 px-2 py-2 rounded-lg text-[15px] font-semibold text-ink hover:bg-paper-subtle transition-colors"
                    >
                      <Icon size={20} className="text-boost-olive-dark shrink-0" />
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <Link
              href="/#plans"
              onClick={close}
              className="inline-flex items-center text-[15px] font-semibold text-boost-olive-dark underline decoration-transparent underline-offset-[3px] hover:decoration-current"
            >
              Voir les tarifs
            </Link>
          </div>
          <Link
            href="/#cas-client"
            onClick={close}
            className="group relative rounded-lg bg-boost-night overflow-hidden hidden lg:flex flex-col"
          >
            {/* Vraie photo Belchicken (la même que le cas client de la landing). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={PHOTOS.belchicken} alt="" className="w-full h-[136px] object-cover" loading="lazy" />
            <div className="p-6 pt-4">
            <p className="relative text-[13px] font-semibold text-boost-light m-0">Cas client</p>
            <p className="relative text-[20px] leading-[1.25] font-semibold text-white mt-2 mb-0">
              {C.restaurant} : de {euros(C.before)} à {euros(C.after)} par mois
            </p>
            <span className="relative inline-flex items-center text-[15px] font-semibold text-boost-light mt-4 underline decoration-transparent underline-offset-[3px] group-hover:decoration-current">
              Lire le cas
            </span>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}

function AssistantGroup({ plan, onPick }: { plan: Plan; onPick: () => void }) {
  return (
    <div>
      <p className="text-[13px] font-medium text-ink-muted m-0 mb-2">
        {plan === "gratuit" ? "Dès le forfait Gratuit" : `Avec ${PLAN_LABEL[plan]}`}
      </p>
      <ul className="space-y-0.5 list-none p-0 m-0">
        {byPlan(plan).map((a) => (
          <li key={a.id}>
            <Link
              href={a.href}
              onClick={onPick}
              className="flex items-center gap-3 -mx-2 px-2 py-2 rounded-lg hover:bg-paper-subtle transition-colors"
            >
              <Portrait id={a.id} size={34} />
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                  {a.name}
                  {a.pilot && (
                    <span className="text-[13px] font-semibold text-white bg-ink rounded-md px-2 py-0.5">Pilote</span>
                  )}
                </span>
                <span className="block text-[13px] text-ink-muted leading-snug">{a.post}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
