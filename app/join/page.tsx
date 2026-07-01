import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { joinRestaurant } from "./actions";

export default async function JoinPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: restaurants }, { data: memberships }] = await Promise.all([
    supabase.from("restaurants").select("id, name").eq("status", "active").order("name"),
    supabase.from("memberships").select("restaurant_id").eq("user_id", user.id),
  ]);

  const joinedIds = new Set((memberships ?? []).map((m) => m.restaurant_id));

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <p className="text-4xl mb-2">🍗</p>
          <h1 className="text-2xl font-bold text-gray-900">Choisis ton restaurant</h1>
          <p className="text-gray-500 text-sm mt-1">
            Tu peux rejoindre plusieurs établissements — chacun garde sa propre équipe et ses propres récompenses.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-4 space-y-2">
          {(restaurants ?? []).length === 0 && (
            <p className="text-center text-sm text-gray-400 py-4">Aucun établissement disponible pour le moment.</p>
          )}

          {(restaurants ?? []).map((r) => (
            <div key={r.id} className="flex items-center justify-between px-4 py-3 rounded-xl border border-gray-200">
              <span className="font-semibold text-gray-900">{r.name}</span>
              {joinedIds.has(r.id) ? (
                <Link
                  href={`/r/${r.id}/dashboard`}
                  className="text-sm font-semibold text-brand-red hover:underline shrink-0"
                >
                  Continuer →
                </Link>
              ) : (
                <form action={joinRestaurant.bind(null, r.id)}>
                  <button
                    type="submit"
                    className="bg-brand-red text-white text-sm font-semibold px-4 py-1.5 rounded-lg hover:bg-red-700 transition-colors shrink-0"
                  >
                    Rejoindre
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-gray-500 mt-5">
          Ton restaurant n&apos;est pas dans la liste ?{" "}
          <Link href="/become-a-partner" className="font-semibold text-brand-red hover:underline">
            Deviens partenaire →
          </Link>
        </p>
      </div>
    </div>
  );
}
