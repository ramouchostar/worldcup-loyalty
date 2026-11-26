import Link from "next/link";
import { euro } from "@/lib/site-orders/cart";
import type { PublicBlock } from "@/lib/restaurant-posts/view";
import { ghost } from "../ui";

// Le corps d'un article (ADR 0111 §4), tel que le client le lit. La console s'en sert pour l'aperçu : « ce que tes
// clients liront » est le même rendu. Texte simple : ni HTML ni lien. Le prix d'un plat vient de la carte.
//
// « Choisir ce plat » ramène à la page de commande avec `?plat=<id>` ; la fiche du plat s'ouvrira quand la page de
// commande lira ce paramètre. `restaurantId` absent = aperçu : le bouton est montré sans mener nulle part.

export function ArticleBody({ blocks, restaurantId }: { blocks: PublicBlock[]; restaurantId?: string }) {
  return (
    <>
      {blocks.map((b, i) => {
        if (b.type === "p") return <p key={i} className="whitespace-pre-line break-words text-[15px] text-ink">{b.text}</p>;
        if (b.type === "h2") return <h2 key={i} className="break-words text-[17px] font-semibold text-ink">{b.text}</h2>;
        if (b.type === "ul") {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5 text-[15px] text-ink">
              {b.items.map((it, j) => <li key={j} className="break-words">{it}</li>)}
            </ul>
          );
        }
        if (b.type === "photo") {
          // Chargée tout de suite : l'adresse signée ne dure que quelques minutes.
          // eslint-disable-next-line @next/next/no-img-element
          return <img key={i} src={b.url} alt={b.alt} className="h-auto w-full rounded-lg bg-paper-subtle" />;
        }
        return (
          <div key={i} className="space-y-3 rounded-lg border border-paper-border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <b className="block break-words text-[15px] font-semibold text-ink">{b.dish.name}</b>
                <p className="text-[13px] tabular-nums text-ink-muted">{euro(b.dish.priceCents)}{b.dish.hasOptions ? " avec choix" : ""}</p>
              </div>
              {b.dish.imageUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={b.dish.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />}
            </div>
            {restaurantId ? (
              <Link href={`/commander/${restaurantId}?plat=${b.dish.id}`} className={`${ghost} flex w-full items-center justify-center`}>Choisir ce plat</Link>
            ) : (
              <span aria-hidden="true" className="flex min-h-[44px] w-full items-center justify-center rounded-lg border border-paper-border text-[15px] font-semibold text-ink-muted">Choisir ce plat</span>
            )}
          </div>
        );
      })}
    </>
  );
}
