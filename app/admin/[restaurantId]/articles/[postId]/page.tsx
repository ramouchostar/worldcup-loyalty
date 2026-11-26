import { redirect } from "next/navigation";
import { NotReady } from "@/components/admin/articles/NotReady";
import { PostEditor } from "@/components/admin/articles/PostEditor";
import { BackLink } from "@/components/admin/articles/ui";
import { PageHeader, Restricted } from "@/components/admin/ui";
import { dishOptions, loadPost, menuForConsole, openConsole } from "../load";

export const metadata = { title: "Écrire un article" };
export const dynamic = "force-dynamic";

// ADR 0111 — reprendre un brouillon, ou modifier un article (la version en ligne ne bouge pas avant « Oui, publier »).

export default async function EditArticlePage({ params }: { params: Promise<{ restaurantId: string; postId: string }> }) {
  const { restaurantId, postId } = await params;
  const { canSee, canWrite } = await openConsole(restaurantId);
  if (!canSee) return <Restricted />;
  if (!canWrite) redirect(`/admin/${restaurantId}/articles`);
  const [loaded, menu] = await Promise.all([loadPost(restaurantId, postId), menuForConsole(restaurantId)]);

  return (
    <div className="max-w-2xl space-y-4">
      <BackLink href={`/admin/${restaurantId}/articles`} label="Mes articles" />
      <PageHeader
        title={loaded.state === "ok" && loaded.post.first_published_at ? "Modifier l'article" : "Écrire un article"}
        subtitle="Tes clients ne voient rien tant que tu n'as pas dit oui."
      />
      {loaded.state === "unavailable" ? (
        <NotReady />
      ) : (
        <PostEditor
          key={`${loaded.post.id}:${loaded.post.revision}`}
          restaurantId={restaurantId}
          postId={loaded.post.id}
          revision={loaded.post.revision}
          initialTitle={loaded.post.draft_title}
          initialBlocks={loaded.post.draft_blocks}
          photoUrls={Object.fromEntries(loaded.photoUrls)}
          dishes={dishOptions(menu)}
          online={loaded.post.status === "en_ligne"}
          maskReason={loaded.post.status === "masque" ? loaded.post.mask_reason ?? "motif non précisé" : null}
        />
      )}
    </div>
  );
}
