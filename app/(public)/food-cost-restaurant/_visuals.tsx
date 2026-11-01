import { FileUp, TrendingDown, TrendingUp } from "lucide-react";

// Visuels de la page food cost. Données d'ILLUSTRATION : plats et prix
// imaginaires (« Smashly »), prix d'achat indicatifs. Calculs vérifiables à
// la main : le food cost se calcule sur le prix de vente HTVA.

export const eur2 = (n: number) => `${n.toLocaleString("fr-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export const BURGER = {
  name: "Smash classique",
  priceTtc: 11.5,
  vatPct: 12,
  lines: [
    { item: "Pain brioché", qty: "1 pièce", cost: 0.38 },
    { item: "Bœuf haché (2 × 90 g, à 11 €/kg)", qty: "180 g", cost: 1.98 },
    { item: "Cheddar", qty: "2 tranches", cost: 0.24 },
    { item: "Sauce maison", qty: "25 g", cost: 0.1 },
    { item: "Oignons, cornichons, salade", qty: "40 g", cost: 0.15 },
  ],
};
export const burgerCost = BURGER.lines.reduce((s, l) => s + l.cost, 0); // 2,85 €
export const burgerHt = Math.round((BURGER.priceTtc / (1 + BURGER.vatPct / 100)) * 100) / 100; // 10,27 €
export const burgerPct = Math.round((burgerCost / burgerHt) * 1000) / 10; // 27,8 %

/** Fiche technique façon carte de cuisine. */
export function RecipeCard() {
  return (
    <div className="relative rounded-[22px] bg-[#FFFDF6] border border-[#E9E2CC] shadow-[0_24px_60px_rgba(60,50,20,0.12)] p-6 sm:p-8 rotate-[-0.6deg]">
      <div className="flex items-start justify-between gap-4 border-b-2 border-dashed border-[#E9E2CC] pb-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-[#8C7B4A] font-bold">Fiche technique</p>
          <p className="font-display text-[26px] font-bold text-ink leading-tight mt-1">{BURGER.name}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-[#8C7B4A]">Prix sur la carte</p>
          <p className="font-display text-[22px] font-bold text-ink">{eur2(BURGER.priceTtc)}</p>
        </div>
      </div>
      <table className="w-full mt-3 text-[14.5px]">
        <tbody>
          {BURGER.lines.map((l) => (
            <tr key={l.item} className="border-b border-[#F0EAD6] last:border-0">
              <td className="py-2.5 pr-3 text-ink">{l.item}</td>
              <td className="py-2.5 pr-3 text-ink-faint whitespace-nowrap">{l.qty}</td>
              <td className="py-2.5 text-right tabular-nums font-semibold text-ink whitespace-nowrap">{eur2(l.cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-white border border-[#E9E2CC] py-3">
          <p className="text-[11px] text-ink-faint">Coût matière</p>
          <p className="font-display text-[19px] font-bold text-ink tabular-nums">{eur2(burgerCost)}</p>
        </div>
        <div className="rounded-xl bg-white border border-[#E9E2CC] py-3">
          <p className="text-[11px] text-ink-faint">Prix HTVA (12 %)</p>
          <p className="font-display text-[19px] font-bold text-ink tabular-nums">{eur2(burgerHt)}</p>
        </div>
        <div className="rounded-xl bg-ink py-3">
          <p className="text-[11px] text-night-text">Food cost</p>
          <p className="font-display text-[19px] font-bold text-moss-light tabular-nums">{burgerPct.toLocaleString("fr-BE")} %</p>
        </div>
      </div>
      <p className="text-[12px] text-ink-faint mt-3">Exemple imaginaire, prix d&apos;achat indicatifs.</p>
    </div>
  );
}

/** La formule, posée comme une division au tableau. */
export function FormulaCard() {
  return (
    <div className="rounded-3xl bg-ink text-white p-7 sm:p-9">
      <p className="text-[11px] uppercase tracking-[0.14em] text-night-faint font-bold">La formule</p>
      <div className="mt-5 flex items-center gap-5 flex-wrap">
        <p className="font-display text-[26px] sm:text-[32px] font-bold">Food cost</p>
        <span className="text-[28px] text-night-faint">=</span>
        <div className="text-center">
          <p className="font-display text-[19px] sm:text-[22px] font-bold border-b-2 border-moss-light pb-1.5">Coût des ingrédients du plat</p>
          <p className="font-display text-[19px] sm:text-[22px] font-bold pt-1.5">Prix de vente HTVA</p>
        </div>
        <span className="text-[22px] text-night-faint">× 100</span>
      </div>
      <p className="font-landing text-[15px] leading-[1.7] text-night-text mt-6">
        Pour le {BURGER.name} : {eur2(burgerCost)} ÷ {eur2(burgerHt)} × 100 = <strong className="text-moss-light">{burgerPct.toLocaleString("fr-BE")} %</strong>.
        Sur chaque euro encaissé hors TVA, environ 28 centimes repartent chez vos fournisseurs de matière première.
      </p>
    </div>
  );
}

/** Pourcentage ou euros : deux plats, deux lectures. */
export function PercentVsEuros() {
  const dishes = [
    { name: "Frites maison", ht: 3.57, cost: 0.46 },
    { name: BURGER.name, ht: burgerHt, cost: burgerCost },
  ].map((d) => ({ ...d, pct: Math.round((d.cost / d.ht) * 1000) / 10, margin: Math.round((d.ht - d.cost) * 100) / 100 }));
  const maxMargin = Math.max(...dishes.map((d) => d.margin));
  return (
    <div className="space-y-4">
      {dishes.map((d) => (
        <div key={d.name} className="rounded-2xl bg-white border border-paper-border p-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-bold text-[16px] text-ink">{d.name}</p>
            <p className="text-[13px] text-ink-muted">food cost <strong className="text-ink">{d.pct.toLocaleString("fr-BE")} %</strong></p>
          </div>
          <div className="mt-3 h-3 rounded-full bg-paper-subtle overflow-hidden">
            <div className="h-full rounded-full bg-moss-dark" style={{ width: `${(d.margin / maxMargin) * 100}%` }} />
          </div>
          <p className="text-[13.5px] text-ink mt-2">Il vous reste <strong className="tabular-nums">{eur2(d.margin)}</strong> par vente pour payer le reste : loyer, salaires, énergie.</p>
        </div>
      ))}
    </div>
  );
}

const MENU = [
  { name: "Smash classique", cat: "Burgers", sale: 11.5, cost: 2.85 },
  { name: "Double smash cheddar", cat: "Burgers", sale: 14.5, cost: 4.42 },
  { name: "Chicken crispy", cat: "Burgers", sale: 12.0, cost: 3.1 },
  { name: "Frites maison", cat: "Accompagnements", sale: 4.0, cost: 0.46 },
  { name: "Milkshake vanille", cat: "Desserts", sale: 5.5, cost: 1.35 },
  { name: "Soda 33 cl", cat: "Boissons", sale: 2.8, cost: 0.6 },
];

/** Écran Menu & coûts dans l'ordinateur. */
export function MenuCostsScreen() {
  const rows = MENU.map((m) => ({ ...m, margin: Math.round((m.sale - m.cost) * 100) / 100 }));
  const best = rows.reduce((a, b) => (b.margin > a.margin ? b : a));
  const worst = rows.reduce((a, b) => (b.margin < a.margin ? b : a));
  return (
    <div className="p-4 sm:p-6 bg-paper">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.12em] text-ink-faint">Smashly</p>
          <p className="font-display text-[20px] font-bold text-ink">Menu &amp; coûts</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-paper-border bg-white px-3 py-1.5 text-[12px] font-semibold text-ink">
          <FileUp className="w-3.5 h-3.5" aria-hidden /> Importer un CSV
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 mt-4">
        <div className="rounded-xl bg-white border border-paper-border px-3.5 py-2.5">
          <p className="flex items-center gap-1.5 text-[11px] text-good font-bold"><TrendingUp className="w-3.5 h-3.5" aria-hidden /> Marge la plus forte</p>
          <p className="text-[13px] font-semibold text-ink mt-0.5">{best.name} · {eur2(best.margin)}</p>
        </div>
        <div className="rounded-xl bg-white border border-paper-border px-3.5 py-2.5">
          <p className="flex items-center gap-1.5 text-[11px] text-danger font-bold"><TrendingDown className="w-3.5 h-3.5" aria-hidden /> Marge la plus faible</p>
          <p className="text-[13px] font-semibold text-ink mt-0.5">{worst.name} · {eur2(worst.margin)}</p>
        </div>
      </div>
      <div className="mt-4 rounded-xl bg-white border border-paper-border overflow-hidden">
        <table className="w-full text-[12.5px]">
          <thead className="bg-paper-subtle text-ink-muted">
            <tr>
              <th className="text-left font-semibold px-3 py-2">Article</th>
              <th className="text-left font-semibold px-3 py-2 hidden sm:table-cell">Catégorie</th>
              <th className="text-right font-semibold px-3 py-2">Prix vente</th>
              <th className="text-right font-semibold px-3 py-2">Prix revient</th>
              <th className="text-right font-semibold px-3 py-2">Marge</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-paper-border">
            {rows.map((r) => (
              <tr key={r.name}>
                <td className="px-3 py-2 font-semibold text-ink">{r.name}</td>
                <td className="px-3 py-2 text-ink-muted hidden sm:table-cell">{r.cat}</td>
                <td className="px-3 py-2 text-right tabular-nums text-ink">{eur2(r.sale)}</td>
                <td className="px-3 py-2 text-right tabular-nums"><span className="rounded-md bg-paper px-1.5 py-0.5 text-ink">{eur2(r.cost)}</span></td>
                <td className="px-3 py-2 text-right tabular-nums font-bold text-ink">{eur2(r.margin)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-ink-faint mt-3">Illustration : carte imaginaire. Prix de vente affichés tels que sur la carte.</p>
    </div>
  );
}
