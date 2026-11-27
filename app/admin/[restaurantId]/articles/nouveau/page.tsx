import { redirect } from "next/navigation";
import { NotReady } from "@/components/admin/articles/NotReady";
import { PostEditor } from "@/components/admin/articles/PostEditor";
import { BackLink } from "@/components/admin/articles/ui";
import { PageHeader, Restricted } from "@/components/admin/ui";
import { dishOptions, menuForConsole, openConsole, postsReady } from "../load";

export const metadata = { title: "Écrire un article" };
export const dynamic = "force-dynamic";

// ADR 0111 — un nouvel article. Le brouillon n'existe qu'au premier « Garder » (ou à la première photo).

export default async function NewArticlePage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const { canSee, canWrite } = await openConsole(restaurantId);
  if (!canSee) return <Restricted />;
  if (!canWrite) redirect(`/admin/${restaurantId}/articles`);
  const [ready, menu] = await Promise.all([postsReady(restaurantId), menuForConsole(restaurantId)]);

  return (
    <div className="max-w-2xl space-y-4">
      <BackLink href={`/admin/${restaurantId}/marketing`} label="Marketing" />
      <PageHeader title="Écrire un article" subtitle="Tes clients ne voient rien tant que tu n'as pas dit oui." />
      {ready ? (
        <PostEditor
          restaurantId={restaurantId}
          postId={null}
          revision={1}
          initialTitle=""
          initialBlocks={[{ type: "p", text: "" }]}
          photoUrls={{}}
          dishes={dishOptions(menu)}
          online={false}
          maskReason={null}
        />
      ) : (
        <NotReady />
      )}
    </div>
  );
}
