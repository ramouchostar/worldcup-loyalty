import Link from "next/link";
import type { PostCard } from "@/lib/restaurant-posts/view";

// Une ligne d'article (ADR 0111) : le titre, les premières lignes dans la liste, la date, la photo s'il y en a une.

export function PostRowLink({ restaurantId, post, withExcerpt = false }: { restaurantId: string; post: PostCard; withExcerpt?: boolean }) {
  return (
    <Link
      href={`/commander/${restaurantId}/articles/${post.slug}`}
      className="flex min-h-[64px] w-full min-w-0 items-start gap-3 py-3 hover:bg-paper-subtle active:bg-paper-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
    >
      <span className="min-w-0 flex-1">
        <b className="block break-words text-[15px] font-semibold text-ink">{post.title}</b>
        {withExcerpt && post.excerpt && <span className="mt-0.5 block break-words text-[13px] text-ink-muted">{post.excerpt}</span>}
        <span className="mt-0.5 block text-[13px] text-ink-muted">{post.publishedLabel}</span>
      </span>
      {post.photoUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={post.photoUrl} alt="" className="h-16 w-16 shrink-0 rounded-lg bg-paper-subtle object-cover" />}
    </Link>
  );
}
