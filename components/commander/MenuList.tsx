import { euro } from "@/lib/site-orders/cart";
import type { PublicItem, PublicMenu } from "@/lib/site-orders/menu";

// La carte, rubrique par rubrique. Toucher un plat demande sa fiche à `OrderApp`.

export function MenuList({ categories, onPick }: { categories: PublicMenu["categories"]; onPick: (item: PublicItem) => void }) {
  return (
    <div>
      {categories.length === 0 && <p className="px-4 py-4 text-[15px] text-ink-muted lg:px-0">Aucun plat n&apos;est proposé à la commande pour le moment.</p>}
      {categories.map((cat) => (
        <section key={cat.name} className="px-4 pt-5 first:pt-1 lg:px-0 lg:pt-6 lg:first:pt-6" aria-label={cat.name}>
          <h2 className="text-[17px] font-semibold text-ink lg:text-[20px]">{cat.name}</h2>
          <ul className="mt-1">
            {cat.items.map((it) => (
              <li key={it.id} className="border-b border-paper-border">
                <button type="button" onClick={() => onPick(it)} className="flex w-full min-w-0 items-start gap-3 py-3 text-left hover:bg-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink lg:gap-4 lg:py-4">
                  <span className="min-w-0 flex-1">
                    <b className="block break-words text-[15px] font-semibold text-ink lg:text-[17px]">{it.name}</b>
                    {it.description && <span className="mt-0.5 block break-words text-[13px] text-ink-muted lg:text-[15px]">{it.description}</span>}
                    <span className="mt-0.5 block text-[13px] tabular-nums text-ink lg:mt-1 lg:text-[15px]">{euro(it.priceCents)}{it.groups.length > 0 ? ", avec choix" : ""}</span>
                  </span>
                  {it.imageUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={it.imageUrl} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-lg object-cover lg:h-[88px] lg:w-[88px]" />}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
