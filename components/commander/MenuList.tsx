import { euro } from "@/lib/site-orders/cart";
import type { PublicItem, PublicMenu } from "@/lib/site-orders/menu";

// La carte, rubrique par rubrique. Toucher un plat demande sa fiche à `OrderApp`.

export function MenuList({ categories, onPick }: { categories: PublicMenu["categories"]; onPick: (item: PublicItem) => void }) {
  return (
    <>
      {categories.length === 0 && <p className="p-4 text-[15px] text-ink-muted">Aucun plat n&apos;est proposé à la commande pour le moment.</p>}
      {categories.map((cat) => (
        <section key={cat.name} className="px-4 pt-5" aria-label={cat.name}>
          <h2 className="text-[17px] font-semibold text-ink">{cat.name}</h2>
          <ul className="mt-2 divide-y divide-paper-border">
            {cat.items.map((it) => (
              <li key={it.id}>
                <button type="button" onClick={() => onPick(it)} className="flex w-full min-w-0 items-start gap-3 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink">
                  <span className="min-w-0 flex-1">
                    <b className="block break-words text-[15px] text-ink">{it.name}</b>
                    {it.description && <span className="mt-0.5 block break-words text-[13px] text-ink-muted">{it.description}</span>}
                    <span className="mt-0.5 block text-[13px] tabular-nums text-ink">{euro(it.priceCents)}{it.groups.length > 0 ? " · avec choix" : ""}</span>
                  </span>
                  {it.imageUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={it.imageUrl} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-lg object-cover" />}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
