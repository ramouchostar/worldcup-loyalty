import Link from "next/link";
import { NotReady } from "@/components/admin/articles/NotReady";
import { PostsList } from "@/components/admin/articles/PostsList";
import { BackLink, primaryBtn } from "@/components/admin/articles/ui";
import { PageHeader, Restricted } from "@/components/admin/ui";
import { loadList, openConsole } from "./load";

export const metadata = { title: "Mes articles" };
export const dynamic = "force-dynamic";

// ADR 0111 — « Mes articles », ouvert depuis la tuile « Écrire un article » de la page Marketing.

export default async function ArticlesConsolePage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const { canSee, canWrite } = await openConsole(restaurantId);
  if (!canSee) return <Restricted />;
  const list = await loadList(restaurantId);
  const base = `/admin/${restaurantId}`;

  return (
    <div className="max-w-2xl space-y-4">
      <BackLink href={`${base}/marketing`} label="Marketing" />
      <PageHeader title="Mes articles" subtitle="Visibles sur ton espace de commande. Google ne les affiche pas." />
      {!canWrite && <p className="text-[13px] text-ink-muted">Mode plateforme : seul le restaurant écrit, publie, retire et supprime ses articles.</p>}
      {list.state === "unavailable" ? (
        <NotReady />
      ) : list.state === "failed" ? (
        <p role="alert" className="text-[15px] text-danger">Impossible de lire tes articles pour le moment. Recharge la page.</p>
      ) : (
        <>
          {canWrite && <Link href={`${base}/articles/nouveau`} className={primaryBtn}>Écrire un article</Link>}
          {list.posts.length === 0 ? (
            <p className="text-[15px] text-ink-muted">Tu n&apos;as pas encore d&apos;article. Tes clients ne voient aucun bloc « Nos articles » tant que rien n&apos;est en ligne.</p>
          ) : (
            <PostsList restaurantId={restaurantId} posts={list.posts} canWrite={canWrite} />
          )}
        </>
      )}
    </div>
  );
}
