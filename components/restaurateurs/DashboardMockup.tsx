"use client";

import { CountUp, Reveal } from "./motion";

// Réplique du mockup "tableau de bord" du design Claude — contenu illustratif
// figé (établissement fictif Belchicken, déjà utilisé comme resto historique
// dans le reste du produit), pas des données réelles.
export function DashboardMockup() {
  return (
    <div className="flex bg-paper font-landing">
      <aside className="w-[230px] shrink-0 bg-white border-r border-paper-border px-3 py-5 flex flex-col gap-[18px]">
        <NavGroup label="Au quotidien">
          <NavItem label="Dashboard" active />
          <NavItem label="Commandes" />
          <NavItem label="Cadeaux" />
        </NavGroup>
        <NavGroup label="Fidélisation">
          <NavItem label="Mes clients" />
          <NavItem label="Broadcasts" />
          <NavItem label="Parrainages" />
        </NavGroup>
        <NavGroup label="Pilotage">
          <NavItem label="Ventes" />
          <NavItem label="Prévisions" />
          <NavItem label="Opportunités" />
          <NavItem label="Baromètre" />
        </NavGroup>
      </aside>

      <div className="flex-1 min-w-0">
        <div className="h-14 bg-ink flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="w-[30px] h-[30px] rounded-lg bg-moss flex items-center justify-center font-display font-bold text-ink text-sm">
              B
            </div>
            <div className="leading-[1.15]">
              <p className="text-white font-semibold text-[13.5px] m-0">Belchicken</p>
              <p className="font-mono text-[9.5px] tracking-[0.12em] uppercase text-moss-light m-0">
                Console restaurateur
              </p>
            </div>
          </div>
          <span className="text-night-text text-xs">Retour espace membre</span>
        </div>

        <div className="px-8 py-7 flex flex-col gap-[18px]">
          <div>
            <h2 className="font-display text-[26px] font-bold tracking-tight text-ink m-0">
              Tableau de bord
            </h2>
            <p className="text-ink-muted text-[13px] mt-1 mb-0">Vendredi 8 août · 128 membres inscrits</p>
          </div>

          <div className="bg-white border border-paper-border rounded-xl overflow-hidden">
            <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-moss-dark m-0 px-5 pt-[15px] pb-[11px]">
              ▶ À faire aujourd&apos;hui
            </p>
            <TaskRow
              tone="danger"
              title="3 commandes suspectes à vérifier"
              desc="Montant inhabituel ou ticket ambigu"
              badge="3"
              icon={<TriangleAlertIcon />}
            />
            <TaskRow
              tone="warn"
              title="5 commandes en attente de validation"
              desc="La confirmation automatique n'a pas pu conclure"
              badge="5"
              icon={<ReceiptIcon />}
            />
          </div>

          <div className="bg-white border-[1.5px] border-moss-tint2 rounded-xl overflow-hidden">
            <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-moss-dark m-0 px-5 pt-[15px] pb-[11px]">
              ▶ Opportunités pour toi
            </p>
            <div className="flex items-center gap-[14px] px-5 py-[13px] border-t border-paper-border">
              <div className="w-9 h-9 rounded-[9px] bg-moss-tint text-moss-dark flex items-center justify-center shrink-0">
                <BulbIcon />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold m-0">Mardi soir est ton creux de la semaine</p>
                <p className="text-xs text-ink-muted mt-0.5 mb-0">-34% de CA vs les autres soirs</p>
              </div>
              <span className="shrink-0 bg-moss text-white text-xs font-bold rounded-lg px-3.5 py-[7px]">
                Lancer
              </span>
            </div>
          </div>

          <div className="bg-ink rounded-xl px-5 py-[18px]">
            <div className="flex items-center justify-between mb-3.5">
              <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-moss-light m-0">
                Ce que le programme t&apos;a rapporté
              </p>
              <span className="text-xs font-semibold text-moss-light">Détail par plat →</span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <Stat value={3240} suffix=" €" label="CA généré (tickets scannés)" color="text-white" />
              <Stat value={612} suffix=" €" label="marge sur articles reconnus" color="text-moss-light" />
              <Stat value={380} suffix=" €" label="gain net estimé" color="text-good" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function NavGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-ink-faint px-2.5 m-0 mb-1">{label}</p>
      <div className="flex flex-col gap-[3px]">{children}</div>
    </div>
  );
}

function NavItem({ label, active }: { label: string; active?: boolean }) {
  return (
    <span
      className={
        active
          ? "px-2.5 py-2 rounded-lg bg-moss-tint text-moss-dark text-[13px] font-semibold"
          : "px-2.5 py-2 text-ink-body text-[13px]"
      }
    >
      {label}
    </span>
  );
}

function TaskRow({
  tone,
  title,
  desc,
  badge,
  icon,
}: {
  tone: "danger" | "warn";
  title: string;
  desc: string;
  badge: string;
  icon: React.ReactNode;
}) {
  const toneClasses = tone === "danger" ? "bg-danger/10 text-danger" : "bg-warn/[0.12] text-warn";
  const badgeClasses = tone === "danger" ? "bg-danger" : "bg-warn";
  return (
    <div className="flex items-center gap-[14px] px-5 py-[13px] border-t border-paper-border">
      <div className={`w-9 h-9 rounded-[9px] flex items-center justify-center shrink-0 ${toneClasses}`}>
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold m-0">{title}</p>
        <p className="text-xs text-ink-muted mt-0.5 mb-0">{desc}</p>
      </div>
      <span className={`text-white text-[11px] font-bold rounded-full px-2.5 py-0.5 ${badgeClasses}`}>
        {badge}
      </span>
    </div>
  );
}

function Stat({
  value,
  suffix,
  label,
  color,
}: {
  value: number;
  suffix: string;
  label: string;
  color: string;
}) {
  return (
    <Reveal>
      <p className={`font-display text-2xl font-bold m-0 ${color}`}>
        <CountUp value={value} suffix={suffix} />
      </p>
      <p className="text-[11.5px] text-white/80 mt-[3px] mb-0">{label}</p>
    </Reveal>
  );
}

function TriangleAlertIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l10 18H2L12 3z" />
      <path d="M12 10v4M12 17.5h.01" />
    </svg>
  );
}

function ReceiptIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2h12v19l-3-2-3 2-3-2-3 2V2z" />
      <path d="M9 7h6M9 11h6M9 15h3" />
    </svg>
  );
}

function BulbIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.4 1 2.5h6c0-1.1.4-1.9 1-2.5A6 6 0 0 0 12 3z" />
    </svg>
  );
}
