import type { PublicMenu } from "@/lib/site-orders/menu";

// L'identité du restaurant, en tête de la carte.

export function OrderHeader({ restaurant }: { restaurant: PublicMenu["restaurant"] }) {
  return (
    <header className="flex items-center gap-3 border-b border-paper-border p-4">
      {restaurant.logoUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={restaurant.logoUrl} alt="" className="h-10 w-10 rounded-full bg-white object-contain" />}
      <div className="min-w-0">
        <h1 className="break-words text-[20px] font-semibold text-ink">{restaurant.name}</h1>
        <p className="text-[13px] text-ink-muted">Commande à emporter. Tu paies au comptoir en la retirant.</p>
      </div>
    </header>
  );
}
