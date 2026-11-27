import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { ArticleBody } from "@/components/commander/articles/ArticleBody";
import { ReadAndMenuBar, ReportButton } from "@/components/commander/articles/ReaderActions";
import { SourceCredit } from "@/components/commander/articles/SourceCredit";
import { TopBack } from "@/components/commander/articles/TopBack";
import { readPublicPost } from "@/lib/restaurant-posts/public-db";
import { dishesOfMenu } from "@/lib/restaurant-posts/view";
import { openArticles, todaysMenu } from "../load";

// ADR 0111 — lire un article : /commander/<établissement>/articles/<adresse>. Mêmes portes que la commande, sinon 404 ;
// un brouillon, un article retiré ou masqué n'existe pas pour le client. NON INDEXÉ. Le nom et le prix des plats sont
// lus sur la carte à l'affichage ; les photos ont une adresse signée de courte durée.

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ restaurantId: string; slug: string }> };

const load = cache(async (restaurantId: string, slug: string) => {
  const { name } = await openArticles(restaurantId);
  const menu = await todaysMenu(restaurantId);
  const post = await readPublicPost(restaurantId, slug, menu ? dishesOfMenu(menu) : new Map());
  if (!post) notFound();
  return { name, post };
});

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { restaurantId, slug } = await params;
  const { post } = await load(restaurantId, slug);
  return { title: post.title, robots: { index: false, follow: false } };
}

export default async function ArticlePage({ params }: Params) {
  const { restaurantId, slug } = await params;
  const { name, post } = await load(restaurantId, slug);
  return (
    <main className="mx-auto max-w-2xl pb-28">
      <TopBack href={`/commander/${restaurantId}/articles`} label="Tous les articles" />
      <article className="space-y-4 p-4" lang="fr">
        <header>
          <h1 className="break-words text-[24px] font-semibold leading-tight tracking-[-0.02em] text-ink">{post.title}</h1>
          <p className="mt-1 text-[13px] text-ink-muted">{name}, le {post.publishedLabel}</p>
        </header>
        <ArticleBody blocks={post.blocks} restaurantId={restaurantId} />
        {post.credit && <SourceCredit credit={post.credit} />}
        <ReportButton restaurantId={restaurantId} slug={post.slug} />
      </article>
      <ReadAndMenuBar restaurantId={restaurantId} slug={post.slug} />
    </main>
  );
}
