import Link from "next/link";
import { AutoBanner, MissedList, UpcomingList } from "@/components/admin/articles/AutoSections";
import { NotReady } from "@/components/admin/articles/NotReady";
import { PostsList, type PostListItem } from "@/components/admin/articles/PostsList";
import { BackLink, ghostBtn, primaryBtn, sectionTitle } from "@/components/admin/articles/ui";
import { PageHeader, Restricted } from "@/components/admin/ui";
import { loadAuto, loadList, openConsole } from "./load";

export const metadata = { title: "Mes articles" };
export const dynamic = "force-dynamic";

// ADR 0111 — « Mes articles », ouvert depuis la tuile « Écrire un article » de la page Marketing. Avec la publication
// automatique (ADR 0112) : le bandeau, « Bientôt publiés », « En ligne » et « Pas publiés ».

export default async function ArticlesConsolePage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const { canSee, canWrite } = await openConsole(restaurantId);
  if (!canSee) return <Restricted />;
  const now = new Date();
  const auto = await loadAuto(restaurantId, now);
  const list = await loadList(restaurantId, auto.occasions, now);
  const base = `/admin/${restaurantId}`;
  // Les rubriques n'apparaissent qu'une fois la publication automatique allumée au moins une fois, ou ce qu'elle a laissé.
  const sections = auto.state === "ok" && (auto.active || auto.upcoming.length > 0 || auto.missed.length > 0);

  const group = (title: string, posts: PostListItem[]) =>
    posts.length > 0 && (
      <section className="space-y-3">
        <h2 className={sectionTitle}>{title}</h2>
        <PostsList restaurantId={restaurantId} posts={posts} canWrite={canWrite} />
      </section>
    );

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
          {auto.state === "ok" && (canWrite ? <AutoBanner restaurantId={restaurantId} active={auto.active} /> : (
            <p className="text-[15px] text-ink">{auto.active ? "Publication automatique activée" : "Publication automatique éteinte"}</p>
          ))}
          {auto.state === "failed" && <p role="alert" className="text-[15px] text-danger">La publication automatique ne se lit pas pour le moment. Recharge la page.</p>}
          {canWrite && (
            <Link href={`${base}/articles/nouveau`} className={auto.active ? ghostBtn : primaryBtn}>{auto.active ? "Écrire moi-même" : "Écrire un article"}</Link>
          )}
          {sections ? (
            <>
              <UpcomingList restaurantId={restaurantId} items={auto.upcoming} canWrite={canWrite} />
              {group("En ligne", list.posts.filter((p) => p.status === "en_ligne"))}
              {group("Brouillons et articles retirés", list.posts.filter((p) => p.status !== "en_ligne"))}
              <MissedList items={auto.missed} />
            </>
          ) : list.posts.length === 0 ? (
            <p className="text-[15px] text-ink-muted">Tu n&apos;as pas encore d&apos;article. Tes clients ne voient aucun bloc « Nos articles » tant que rien n&apos;est en ligne.</p>
          ) : (
            <PostsList restaurantId={restaurantId} posts={list.posts} canWrite={canWrite} />
          )}
        </>
      )}
    </div>
  );
}
