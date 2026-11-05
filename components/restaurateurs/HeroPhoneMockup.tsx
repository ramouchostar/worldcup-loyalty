import type { AssistantId } from "@/lib/agents/types";
import { PhoneFrame } from "./PhoneFrame";
import { Portrait } from "./Portrait";
import { assistant } from "./brigade";

// Héros (Brigade 17, maquette du 2026-11-04) : l'écran « Idées du jour » de la
// console (ADR 0089 §6) dans un iPhone, trois idées du matin. Établissement
// IMAGINAIRE, données d'illustration figées. Écart à la maquette : la troisième
// idée n'est plus « Nina : 14 commandes en direct » (Nina est en pilote, et
// Boosteats ne voit pas les commandes, ADR 0088 §3) mais une idée de Chloé.
// Texte de console reproduit en impersonnel (CONTEXT.md, registre de la landing).

const IDEAS: { id: AssistantId; tag: string; when: string; text: string }[] = [
  { id: "hugo", tag: "Relances", when: "maint.", text: "340 clients ne sont pas revenus depuis un mois. Une boisson offerte mardi ?" },
  { id: "emma", tag: "Pub", when: "8 min", text: "Pub « Menu Smash » prête : 14 € par jour, à 3 km. On lance ?" },
  { id: "chloe", tag: "Chiffres", when: "1 h", text: "Le jeudi soir est le plus calme du mois. Une promo ce jeudi ?" },
];

export function HeroPhoneMockup() {
  return (
    <PhoneFrame>
      <div className="h-9" />
      <div className="px-4 pt-3 pb-6 flex flex-col gap-2.5">
        <div>
          <p className="text-[10.5px] text-ink-faint m-0">Mardi 12 novembre · Smashly, Ixelles</p>
          <p className="font-display text-[19px] font-bold text-ink m-0 leading-tight mt-0.5">3 idées à valider ce matin</p>
        </div>

        {IDEAS.map((idea) => {
          const a = assistant(idea.id);
          return (
            <div key={idea.id} className="bg-white border border-paper-border rounded-xl px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Portrait id={idea.id} size={26} />
                <p className="text-[11.5px] font-semibold text-ink m-0 flex-1">
                  {a.name} <span className="font-normal text-ink-faint">· {idea.tag}</span>
                </p>
                <span className="text-[10px] text-ink-faint">{idea.when}</span>
              </div>
              <p className="text-[12px] leading-snug text-ink-body m-0 mt-1.5">{idea.text}</p>
              <div className="flex gap-1.5 mt-2">
                <span className="text-[10.5px] font-bold text-white bg-ink rounded-md px-2.5 py-1">Oui</span>
                <span className="text-[10.5px] font-semibold text-ink border border-paper-border rounded-md px-2.5 py-1">Non</span>
                <span className="text-[10.5px] text-ink-muted px-1.5 py-1">Plus tard</span>
              </div>
            </div>
          );
        })}
      </div>
    </PhoneFrame>
  );
}
