import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { getPointsSummary } from "@/lib/points";
import { getRestaurantDisplayName } from "@/lib/restaurant";
import { displayItemName } from "@/lib/menu-quantity";
import { DeleteAccountForm, type DeletionLoss } from "@/components/member/DeleteAccountForm";

export const metadata = { title: "Supprimer mon compte" };
export const dynamic = "force-dynamic";

// Droit à l'effacement (ADR 0025) sur sa propre page : ce qu'on perd, une
// alternative quand c'est juste « trop d'e-mails », une raison facultative.
// Jamais d'obstacle : un seul bouton suffit toujours à supprimer.
export default async function DeleteAccountPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const [{ data: memberships }, { data: rewards }] = await Promise.all([
    admin.from("memberships").select("restaurant_id").eq("user_id", user.id),
    admin.from("pending_rewards").select("restaurant_id, solo_item").eq("user_id", user.id).eq("status", "available"),
  ]);

  const losses: DeletionLoss[] = await Promise.all(
    ((memberships ?? []) as { restaurant_id: string }[]).map(async ({ restaurant_id }) => {
      const [name, points] = await Promise.all([
        getRestaurantDisplayName(restaurant_id).catch(() => null),
        getPointsSummary(user.id, restaurant_id),
      ]);
      const gifts = ((rewards ?? []) as { restaurant_id: string; solo_item: string | null }[])
        .filter((r) => r.restaurant_id === restaurant_id && r.solo_item)
        .map((r) => displayItemName(r.solo_item as string));
      return { restaurant: name ?? "ton restaurant", points: points.available + points.pending, gifts };
    })
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-5">
        <Link
          href="/compte"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
        >
          <span aria-hidden="true">←</span> Mon compte
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Supprimer mon compte</h1>
        <DeleteAccountForm losses={losses} />
      </div>
    </div>
  );
}
