"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { readJsonSafe } from "@/lib/fetch-json";
import type { PublicMenu } from "@/lib/site-orders/menu";
import type { PostCard } from "@/lib/restaurant-posts/view";
import { PostRowLink } from "./articles/PostRowLink";

// ADR 0111 §1 — le bloc compact « Nos articles », entre les promotions et la carte : le dernier article en ligne et
// « Tous les articles ». Aucun article, lecture impossible ou tables pas encore créées : RIEN n'est rendu, pas même un
// conteneur. `OrderApp` fournit l'établissement et sa carte ; la carte n'est pas nécessaire ici.

export function ArticlesSlot({ restaurantId }: { restaurantId: string; menu: PublicMenu }) {
  const [latest, setLatest] = useState<PostCard | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch(`/api/restaurant-posts/latest?restaurantId=${encodeURIComponent(restaurantId)}`, { cache: "no-store" });
        const { data } = await readJsonSafe<{ latest: PostCard | null }>(res);
        if (live && res.ok && data?.latest) setLatest(data.latest);
      } catch {
        /* le bloc est un plus : sans réponse, la carte s'affiche sans lui */
      }
    })();
    return () => { live = false; };
  }, [restaurantId]);

  if (!latest) return null;
  return (
    <section className="px-4 pt-5" aria-labelledby="nos-articles">
      <h2 id="nos-articles" className="text-[17px] font-semibold text-ink">Nos articles</h2>
      <PostRowLink restaurantId={restaurantId} post={latest} />
      <Link href={`/commander/${restaurantId}/articles`} className="inline-flex min-h-[44px] items-center text-[15px] font-semibold text-boost-olive-dark underline hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink">
        Tous les articles
      </Link>
    </section>
  );
}
