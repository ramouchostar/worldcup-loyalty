"use client";

// Version mobile-native du mockup "Opportunités" — mêmes chiffres que
// InsightsMockup (desktop), recomposés à des tailles/paddings mobiles au
// lieu d'une capture desktop réduite (illisible en dessous de md).
export function InsightsMockupMobile() {
  return (
    <div className="flex flex-col gap-3 font-landing">
      <div>
        <h3 className="font-display text-lg font-bold tracking-tight text-ink m-0">Opportunités</h3>
        <p className="text-ink-muted text-xs mt-0.5 mb-0">4 suggestions calculées sur tes 30 derniers jours</p>
      </div>

      <div className="bg-white border-[1.5px] border-moss-tint2 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-moss-dark">Jour creux</span>
          <span className="bg-moss-tint text-moss-dark text-[10px] font-bold rounded-full px-2 py-0.5">
            Marge préservée
          </span>
        </div>
        <p className="text-sm font-bold m-0 leading-snug">
          Promo « 2 menus achetés, 1 dessert offert » le mardi
        </p>
        <p className="text-xs text-ink-muted mt-1.5 mb-3">
          Le mardi fait 34% de CA en moins que ta moyenne. Le dessert te coûte 0,42 € et remonte le panier moyen de
          3,80 €.
        </p>
        <div className="flex gap-4 pb-3 mb-3 border-b border-paper-border">
          <div>
            <p className="font-display text-base font-bold m-0">+ 182 €</p>
            <p className="text-[10px] text-ink-faint mt-0.5 mb-0">CA estimé</p>
          </div>
          <div>
            <p className="font-display text-base font-bold m-0">− 20 €</p>
            <p className="text-[10px] text-ink-faint mt-0.5 mb-0">coût matière</p>
          </div>
        </div>
        <div className="flex gap-2">
          <span className="flex-1 text-center border border-paper-border text-ink-muted text-xs font-semibold rounded-lg py-2">
            Ignorer
          </span>
          <span className="flex-1 text-center bg-moss text-white text-xs font-bold rounded-lg py-2">
            Programmer
          </span>
        </div>
      </div>

      <MobileOpportunityRow
        label="Combo"
        title="Burger + Frites en formule"
        desc="72% des clients achètent déjà les deux séparément"
        cta="Configurer"
      />
      <MobileOpportunityRow
        label="Réactivation"
        title="14 clients n'ont pas commandé depuis 3 semaines"
        desc="Message ciblé, sans remise — leur cadeau les attend déjà"
        cta="Envoyer"
      />
    </div>
  );
}

function MobileOpportunityRow({
  label,
  title,
  desc,
  cta,
}: {
  label: string;
  title: string;
  desc: string;
  cta: string;
}) {
  return (
    <div className="bg-white border border-paper-border rounded-xl p-3.5">
      <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-ink-faint">{label}</span>
      <p className="text-sm font-semibold mt-1 mb-0.5">{title}</p>
      <p className="text-xs text-ink-muted mt-0 mb-2.5">{desc}</p>
      <span className="inline-block border border-paper-border text-ink-body text-xs font-semibold rounded-lg px-3.5 py-1.5">
        {cta}
      </span>
    </div>
  );
}
