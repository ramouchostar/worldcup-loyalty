"use client";

import { CountUp, FillBar } from "./motion";

// Réplique du mockup "app membre" du design Claude. Couleurs rouge/or figées
// (#D93A1E, #F5B32B…) : ce sont volontairement CELLES de l'établissement
// fictif Belchicken, pas la charte Boosteats — l'app membre porte la couleur
// du restaurant, jamais la nôtre (cf. copie du hero).
export function MemberAppMockup() {
  return (
    <div className="bg-paper rounded-[25px] overflow-hidden flex flex-col font-landing">
      <div className="bg-[#1A0F0B] px-4 pt-3.5 pb-4">
        <div className="flex items-center justify-between">
          <span className="text-white font-bold text-[13px] tracking-wide">BELCHICKEN</span>
        </div>
        <p className="font-mono text-[9.5px] tracking-[0.12em] uppercase text-[#F5B32B] mt-4 mb-1.5">
          Ta prochaine commande
        </p>
        <p className="font-display text-[19px] font-bold text-white m-0 leading-tight">Finest burger offert</p>
        <p className="text-xs text-[#D9C4B8] mt-1.5 mb-0">+ Churros 12 pcs · force de ta communauté</p>
      </div>

      <div className="flex-1 px-4 py-3.5 flex flex-col gap-2.5">
        <div className="bg-white border border-paper-border rounded-[10px] p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold">Ton équipe</span>
            <span className="font-mono text-[11px] text-[#D93A1E] font-semibold">
              <CountUp value={7240} suffix=" pts" />
            </span>
          </div>
          <FillBar
            percent={72}
            trackClassName="h-1.5 bg-paper-subtle rounded-full overflow-hidden"
            className="h-1.5 bg-[#D93A1E] rounded-full"
          />
          <p className="text-[10.5px] text-ink-faint mt-1.5 mb-0">Prochain palier à 10 000 pts</p>
        </div>

        <div className="bg-white border border-paper-border rounded-[10px] p-3">
          <p className="text-[9.5px] font-semibold tracking-[0.06em] uppercase text-ink-faint m-0 mb-2">
            Action à faire
          </p>
          <div className="flex items-center gap-2.5">
            <div className="w-[34px] h-[34px] rounded-[9px] bg-paper-subtle shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-semibold m-0">Laisse un avis Google</p>
              <p className="text-[10px] text-ink-faint mt-0.5 mb-0">+1 jeton · 4 jetons = 1 cadeau</p>
            </div>
          </div>
          <div className="flex gap-1.5 mt-2.5">
            <span className="flex-1 text-center bg-[#D93A1E] text-white text-[10.5px] font-semibold rounded-lg py-[7px]">
              J&apos;y vais
            </span>
            <span className="flex-1 text-center bg-paper-subtle text-ink-muted text-[10.5px] font-semibold rounded-lg py-[7px]">
              Plus tard
            </span>
          </div>
        </div>

        <div className="bg-[#FDF0D2] rounded-[10px] p-3">
          <p className="text-xs font-semibold text-[#7A3D0E] m-0">Cadeau disponible au comptoir</p>
          <p className="text-[10.5px] text-[#8A5A1E] mt-[3px] mb-0">
            Expire dans 41h · récupère-le à ta prochaine visite
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <MiniCard title="Récompenses" sub="2 paliers atteints" />
          <MiniCard title="Classement" sub="3ᵉ / 12" />
          <MiniCard title="Ma réserve" sub="48 points" />
          <MiniCard title="Mon avis" sub="Donne ton retour" />
        </div>
      </div>

      <div className="bg-white border-t border-paper-border flex justify-around px-1 pt-2 pb-3">
        <TabIcon active label="Accueil">
          <path d="M4 10l8-6 8 6v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />
        </TabIcon>
        <TabIcon label="Équipe">
          <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
          <circle cx="10" cy="7" r="4" />
        </TabIcon>
        <TabIcon label="Scanner">
          <path d="M6 2h12v19l-3-2-3 2-3-2-3 2V2z" />
          <path d="M9 8h6M9 12h6" />
        </TabIcon>
        <TabIcon label="Cadeaux">
          <rect x="3" y="8" width="18" height="4" rx="1" />
          <path d="M12 8v13M3 12v6a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-6" />
        </TabIcon>
        <TabIcon label="Actions">
          <path d="M12 2.5l2.9 6 6.6.6-5 4.4 1.5 6.5L12 16.8l-5.9 3.2 1.5-6.5-5-4.4 6.6-.6L12 2.5z" />
        </TabIcon>
      </div>
    </div>
  );
}

function MiniCard({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="bg-white border border-paper-border rounded-[10px] p-2.5">
      <p className="text-[11.5px] font-semibold m-0">{title}</p>
      <p className="text-[10px] text-ink-faint mt-0.5 mb-0">{sub}</p>
    </div>
  );
}

function TabIcon({ active, label, children }: { active?: boolean; label: string; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col items-center gap-[3px] ${active ? "text-[#D93A1E]" : "text-ink-faint"}`}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
      <span className={`text-[9px] ${active ? "font-semibold" : ""}`}>{label}</span>
    </div>
  );
}
