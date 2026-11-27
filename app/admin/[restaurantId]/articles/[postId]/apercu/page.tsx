import { notFound, redirect } from "next/navigation";
import { AutoReview } from "@/components/admin/articles/AutoReview";
import { NotReady } from "@/components/admin/articles/NotReady";
import { PublishReview } from "@/components/admin/articles/PublishReview";
import { BackLink } from "@/components/admin/articles/ui";
import { Restricted } from "@/components/admin/ui";
import { ArticleBody } from "@/components/commander/articles/ArticleBody";
import { excerpt, photoPaths } from "@/lib/restaurant-posts/blocks";
import { pendingIssues } from "@/lib/restaurant-posts/auto/actions";
import { NO_OFFERINGS, readOfferings } from "@/lib/restaurant-posts/auto/offerings";
import { dayWord } from "@/lib/restaurant-posts/auto/overview";
import { sourceDetails } from "@/lib/restaurant-posts/auto/phrases";
import { occasionOfPost } from "@/lib/restaurant-posts/auto/server";
import { brusselsDay } from "@/lib/restaurant-posts/auto/time";
import { supabasePostsDb } from "@/lib/restaurant-posts/db";
import { PostsUnavailableError } from "@/lib/restaurant-posts/service";
import { dishesOfMenu, viewBlocks } from "@/lib/restaurant-posts/view";
import { loadPost, menuForConsole, openConsole } from "../../load";

export const metadata = { title: "Avant de publier" };
export const dynamic = "force-dynamic";

// ADR 0111 §3 — l'aperçu et « Oui, publier ». Ce que le gérant lit ici est le rendu que le client lira.
// ADR 0112 — pour un article d'occasion qui attend : « Avant la publication » (`?de=message` : on arrive de l'e-mail).

async function postExists(restaurantId: string, postId: string): Promise<boolean> {
  try {
    return (await supabasePostsDb().get(restaurantId, postId)) !== null;
  } catch (e) {
    if (e instanceof PostsUnavailableError) return true; // l'écran dira « pas encore activé »
    throw e;
  }
}

export default async function ReviewArticlePage({ params, searchParams }: {
  params: Promise<{ restaurantId: string; postId: string }>;
  searchParams: Promise<{ de?: string }>;
}) {
  const { restaurantId, postId } = await params;
  const { canSee, canWrite } = await openConsole(restaurantId);
  if (!canSee) return <Restricted />;
  if (!canWrite) redirect(`/admin/${restaurantId}/articles`);
  // Le lien de l'e-mail après un refus ou un abandon : l'article n'existe plus, la liste dit pourquoi.
  if (!(await postExists(restaurantId, postId))) {
    if ((await searchParams).de === "message") redirect(`/admin/${restaurantId}/articles`);
    notFound();
  }
  const [loaded, menu] = await Promise.all([loadPost(restaurantId, postId), menuForConsole(restaurantId)]);
  const edit = `/admin/${restaurantId}/articles/${postId}`;

  if (loaded.state === "unavailable") {
    return (
      <div className="max-w-2xl space-y-4">
        <BackLink href={`/admin/${restaurantId}/articles`} label="Mes articles" />
        <NotReady />
      </div>
    );
  }

  const { post, photoUrls } = loaded;
  const blocks = viewBlocks(post.draft_blocks, photoUrls, menu ? dishesOfMenu(menu) : new Map());
  const title = post.draft_title || "Sans titre";
  const full = (
    <div className="space-y-4">
      <p className="break-words text-[24px] font-semibold leading-tight tracking-[-0.02em] text-ink">{title}</p>
      <ArticleBody blocks={blocks} />
      {post.source_credit && <p className="break-words text-[13px] text-ink-muted">{post.source_credit}</p>}
    </div>
  );

  const occasion = post.origin === "auto" ? await occasionOfPost(restaurantId, postId) : null;
  if (occasion && occasion.status === "prevenu" && post.status === "brouillon") {
    const day = dayWord(occasion.publish_day, brusselsDay(new Date()));
    const offerings = await readOfferings(restaurantId).catch(() => NO_OFFERINGS);
    const hasDish = blocks.some((b) => b.type === "dish");
    return (
      <div className="max-w-2xl space-y-4">
        <BackLink href={`/admin/${restaurantId}/articles`} label="Mes articles" />
        <h1 className="sr-only">Avant la publication</h1>
        <AutoReview
          key={`${post.id}:${post.revision}`}
          restaurantId={restaurantId}
          postId={post.id}
          revision={post.revision}
          when={`${day.charAt(0).toLowerCase()}${day.slice(1)} à 10:00`}
          issues={pendingIssues(post, menu ? new Set(menu.categories.flatMap((c) => c.items).map((i) => i.id)) : null)}
          hasPhotos={photoPaths(post.draft_blocks).length > 0}
          modified={occasion.modified_at !== null}
          sources={sourceDetails(occasion.facts, { hasDish, offerings, expiresAt: occasion.expires_at })}
          preview={<article className="rounded-lg border border-paper-border bg-white p-4">{full}</article>}
        />
      </div>
    );
  }

  const cover = blocks.find((b) => b.type === "photo");
  const start = excerpt(post.draft_blocks, 220);

  return (
    <div className="max-w-2xl space-y-4">
      <BackLink href={edit} label="Modifier" />
      <header>
        <h1 className="break-words text-[20px] font-semibold tracking-[-0.02em] text-ink">{title}</h1>
        <p className="text-[13px] text-ink-muted">Aperçu de ce que tes clients liront.</p>
      </header>
      <PublishReview
        key={`${post.id}:${post.revision}`}
        restaurantId={restaurantId}
        postId={post.id}
        revision={post.revision}
        hasPhotos={photoPaths(post.draft_blocks).length > 0}
        maskReason={post.status === "masque" ? post.mask_reason ?? "motif non précisé" : null}
        summary={
          <>
            {cover?.type === "photo" && /* eslint-disable-next-line @next/next/no-img-element */ <img src={cover.url} alt={cover.alt} className="h-auto w-full rounded-lg bg-paper-subtle" />}
            <p className="break-words text-[15px] text-ink">{start || "Pas encore de texte."}</p>
          </>
        }
        full={full}
      />
    </div>
  );
}
