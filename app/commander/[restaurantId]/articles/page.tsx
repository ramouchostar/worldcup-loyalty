import type { Metadata } from "next";
import { PostRowLink } from "@/components/commander/articles/PostRowLink";
import { CartReturnBar } from "@/components/commander/articles/ReaderActions";
import { TopBack } from "@/components/commander/articles/TopBack";
import { readPostCards } from "@/lib/restaurant-posts/public-db";
import type { PostCard } from "@/lib/restaurant-posts/view";
import { openArticles, todaysMenu } from "./load";

// ADR 0111 — « Nos articles », du plus récent au plus ancien. NON INDEXÉ (noindex, nofollow), absent du plan du site,
// jamais bloqué dans robots.txt (Google doit pouvoir lire le refus). Toute personne qui a le lien peut lire.

export const metadata: Metadata = { title: "Nos articles", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ArticlesPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const { name } = await openArticles(restaurantId);
  let posts: PostCard[] | null = null;
  try {
    posts = await readPostCards(restaurantId);
  } catch (e) {
    console.error("[blog] liste :", e);
  }
  const menu = await todaysMenu(restaurantId);

  return (
    <main className="mx-auto max-w-2xl pb-28">
      <TopBack href={`/commander/${restaurantId}`} label="Retour à la carte" />
      <div className="p-4">
        <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-ink">Nos articles</h1>
        <p className="text-[13px] text-ink-muted">{name}</p>
        {posts === null ? (
          <p role="alert" className="mt-4 text-[15px] text-danger">Impossible d&apos;afficher les articles pour le moment. Recharge la page.</p>
        ) : posts.length === 0 ? (
          <p className="mt-4 text-[15px] text-ink-muted">Aucun article en ce moment.</p>
        ) : (
          <ul className="mt-4 divide-y divide-paper-border border-b border-paper-border">
            {posts.map((p) => (
              <li key={p.slug}><PostRowLink restaurantId={restaurantId} post={p} withExcerpt /></li>
            ))}
          </ul>
        )}
      </div>
      {menu && <CartReturnBar restaurantId={restaurantId} menu={menu} />}
    </main>
  );
}
