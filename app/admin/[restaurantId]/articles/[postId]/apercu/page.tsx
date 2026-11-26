import { redirect } from "next/navigation";
import { NotReady } from "@/components/admin/articles/NotReady";
import { PublishReview } from "@/components/admin/articles/PublishReview";
import { BackLink } from "@/components/admin/articles/ui";
import { Restricted } from "@/components/admin/ui";
import { ArticleBody } from "@/components/commander/articles/ArticleBody";
import { excerpt, photoPaths } from "@/lib/restaurant-posts/blocks";
import { dishesOfMenu, viewBlocks } from "@/lib/restaurant-posts/view";
import { loadPost, menuForConsole, openConsole } from "../../load";

export const metadata = { title: "Avant de publier" };
export const dynamic = "force-dynamic";

// ADR 0111 §3 — l'aperçu et « Oui, publier ». Ce que le gérant lit ici est le rendu que le client lira.

export default async function ReviewArticlePage({ params }: { params: Promise<{ restaurantId: string; postId: string }> }) {
  const { restaurantId, postId } = await params;
  const { canSee, canWrite } = await openConsole(restaurantId);
  if (!canSee) return <Restricted />;
  if (!canWrite) redirect(`/admin/${restaurantId}/articles`);
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
  const cover = blocks.find((b) => b.type === "photo");
  const start = excerpt(post.draft_blocks, 220);
  const title = post.draft_title || "Sans titre";

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
        full={
          <div className="space-y-4">
            <p className="break-words text-[24px] font-semibold leading-tight tracking-[-0.02em] text-ink">{title}</p>
            <ArticleBody blocks={blocks} />
          </div>
        }
      />
    </div>
  );
}
