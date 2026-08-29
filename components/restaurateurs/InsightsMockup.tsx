"use client";

// Réplique du mockup "Opportunités" (/admin/[id]/insights) du design Claude.
export function InsightsMockup() {
  return (
    <div className="p-7 flex flex-col gap-3.5 font-landing">
      <h3 className="font-display text-2xl font-bold tracking-tight text-ink m-0">Opportunités</h3>
      <p className="text-ink-muted text-[13px] -mt-2 mb-0">4 suggestions calculées sur tes 30 derniers jours</p>

      <div className="bg-white border-[1.5px] border-moss-tint2 rounded-xl px-5 py-[18px]">
        <div className="flex items-center justify-between mb-2.5">
          <span className="font-mono text-[10.5px] tracking-[0.12em] uppercase text-moss-dark">Jour creux</span>
          <span className="bg-moss-tint text-moss-dark text-[11px] font-bold rounded-full px-2.5 py-0.5">
            Marge préservée
          </span>
        </div>
        <p className="text-[17px] font-bold m-0">Promo « 2 menus achetés, 1 dessert offert » le mardi</p>
        <p className="text-[13px] text-ink-muted mt-1.5 mb-3.5">
          Le mardi fait 34% de CA en moins que ta moyenne. Le dessert te coûte 0,42 € et remonte le panier moyen de
          3,80 €.
        </p>
        <div className="flex gap-6 pt-3 border-t border-paper-border">
          <div>
            <p className="font-display text-xl font-bold m-0">+ 182 €</p>
            <p className="text-[11px] text-ink-faint mt-0.5 mb-0">CA estimé sur la soirée</p>
          </div>
          <div>
            <p className="font-display text-xl font-bold m-0">− 20 €</p>
            <p className="text-[11px] text-ink-faint mt-0.5 mb-0">coût matière des desserts</p>
          </div>
          <div className="ml-auto self-center flex gap-2.5">
            <span className="border border-paper-border text-ink-muted text-sm font-semibold rounded-lg px-4 py-2.5">
              Ignorer
            </span>
            <span className="bg-moss text-white text-sm font-bold rounded-lg px-[18px] py-2.5">Programmer</span>
          </div>
        </div>
      </div>

      <OpportunityRow
        label="Combo"
        title="Burger + Frites en formule"
        desc="72% des clients achètent déjà les deux séparément"
        cta="Configurer"
      />
      <OpportunityRow
        label="Réactivation"
        title="14 clients n'ont pas commandé depuis 3 semaines"
        desc="Message ciblé, sans remise — leur cadeau les attend déjà"
        cta="Envoyer"
      />
    </div>
  );
}

function OpportunityRow({
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
    <div className="bg-white border border-paper-border rounded-xl px-5 py-4 flex items-center gap-4">
      <div className="flex-1">
        <span className="font-mono text-[10.5px] tracking-[0.12em] uppercase text-ink-faint">{label}</span>
        <p className="text-[15px] font-semibold mt-1 mb-0">{title}</p>
        <p className="text-[12.5px] text-ink-muted mt-0.5 mb-0">{desc}</p>
      </div>
      <span className="border border-paper-border text-ink-body text-sm font-semibold rounded-lg px-4 py-[9px]">
        {cta}
      </span>
    </div>
  );
}
