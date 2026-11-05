"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Calculator, ChevronDown, Gauge, MapPin, type LucideIcon } from "lucide-react";
import { KRAAINEM_CASE as C, euros } from "@/lib/case-studies";
import type { Plan } from "@/lib/entitlements";
import { Portrait } from "./Portrait";
import { BRIGADE, PLAN_LABEL } from "./brigade";

// Menu « La brigade » de l'en-tête (ex-« Notre offre » du 2026-11-03, sur le
// modèle d'owner.com). Brigade 17 (maquette du 2026-11-04) : les fonctions sont
// rangées par assistant et par forfait (ADR 0089 §1), chacune reliée à sa page ;
// Nina et Max portent « Pilote » (ADR 0070, 0088). Les pages qui ne sont le
// poste de personne restent sous « Et aussi ». À droite, le cas Kraainem
// (accord du propriétaire) : jamais « grâce à nous ».

type Tool = { label: string; href: string; Icon: LucideIcon };

const TOOLS: Tool[] = [
  { label: "Analyse gratuite", href: "/audit-gratuit", Icon: Gauge },
  { label: "Fiche Google", href: "/fiche-google-restaurant", Icon: MapPin },
  { label: "Coût de chaque plat", href: "/food-cost-restaurant", Icon: Calculator },
];

const byPlan = (plan: Plan) => BRIGADE.filter((a) => a.plan === plan);

export function OfferMenu() {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1 text-[13.5px] font-medium transition-colors ${open ? "text-white" : "text-night-text hover:text-white"}`}
      >
        La brigade
        <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>

      <div
        id="menu-offre"
        className={`absolute left-0 top-full pt-4 -translate-x-[20%] transition-[opacity,transform] duration-200 ${
          open ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 -translate-y-1 pointer-events-none"
        }`}
      >
        <div className="w-[860px] bg-white rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.25)] border border-paper-border p-7 grid grid-cols-[1fr_1fr_250px] gap-8">
          <AssistantGroup plan="gratuit" onPick={close} />
          <div className="space-y-7 border-r border-paper-border pr-8">
            <AssistantGroup plan="croissance" onPick={close} />
            <AssistantGroup plan="pro" onPick={close} />
            <div>
              <p className="text-[13px] font-medium text-ink-faint m-0 mb-2.5">Et aussi</p>
              <ul className="space-y-0.5 list-none p-0 m-0">
                {TOOLS.map(({ label, href, Icon }) => (
                  <li key={label}>
                    <Link
                      href={href}
                      onClick={close}
                      className="flex items-center gap-3 -mx-2 px-2 py-1.5 rounded-lg text-[14px] font-semibold text-ink hover:bg-paper-subtle transition-colors"
                    >
                      <Icon className="w-[18px] h-[18px] text-ink-muted shrink-0" strokeWidth={1.75} aria-hidden />
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <Link
              href="/#plans"
              onClick={close}
              className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-ink hover:text-moss-dark"
            >
              Voir les tarifs <ArrowRight className="w-4 h-4" aria-hidden />
            </Link>
          </div>
          <Link
            href="/#cas-client"
            onClick={close}
            className="group relative rounded-2xl bg-ink overflow-hidden p-5 flex flex-col justify-end min-h-[260px]"
          >
            <div
              className="absolute inset-0 opacity-90"
              aria-hidden
              style={{ background: "radial-gradient(circle at 80% 10%, rgba(162,197,35,0.45), transparent 60%)" }}
            />
            <div className="absolute top-5 left-5 right-5 flex items-end gap-2 h-[90px]" aria-hidden>
              {[38, 58, 80, 100].map((h, i) => (
                <span
                  key={h}
                  className="flex-1 rounded-t-md"
                  style={{ height: `${h}%`, background: i === 3 ? "#A2C523" : `rgba(162,197,35,${0.25 + i * 0.18})` }}
                />
              ))}
            </div>
            <p className="relative text-[11.5px] font-bold uppercase tracking-[0.1em] text-moss-light m-0">Cas client</p>
            <p className="relative font-display text-[18px] leading-[1.25] font-bold text-white mt-2 mb-0">
              {C.restaurant} : de {euros(C.before)} à {euros(C.after)} par mois
            </p>
            <span className="relative inline-flex items-center gap-1 text-[13px] font-semibold text-moss-light mt-3 group-hover:text-white">
              Lire le cas <ArrowRight className="w-3.5 h-3.5" aria-hidden />
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}

function AssistantGroup({ plan, onPick }: { plan: Plan; onPick: () => void }) {
  return (
    <div>
      <p className="text-[13px] font-medium text-ink-faint m-0 mb-2.5">
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
                <span className="flex items-center gap-2 text-[14.5px] font-semibold text-ink">
                  {a.name}
                  {a.pilot && (
                    <span className="text-[11px] font-semibold text-white bg-ink rounded-full px-2 py-0.5">Pilote</span>
                  )}
                </span>
                <span className="block text-[12.5px] text-ink-muted leading-snug">{a.post}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
