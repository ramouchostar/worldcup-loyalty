import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { getRestaurantId } from "@/lib/restaurant";

export default async function AdminLandingPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const [{ data: owned }, { data: profile }] = await Promise.all([
    admin.from("restaurants").select("id, name").eq("owner_id", user.id).order("name"),
    admin.from("profiles").select("is_admin").eq("id", user.id).single(),
  ]);

  const restaurants = [...(owned ?? [])];

  // Pont legacy — les comptes is_admin (ADMIN_EMAILS) gardent l'accès au
  // restaurant par défaut tant qu'ils n'en sont pas explicitement owner.
  if (profile?.is_admin) {
    const legacyId = getRestaurantId();
    if (!restaurants.some((r) => r.id === legacyId)) {
      const { data: legacy } = await admin.from("restaurants").select("id, name").eq("id", legacyId).maybeSingle();
      if (legacy) restaurants.push(legacy);
    }
  }

  if (restaurants.length === 1) redirect(`/admin/${restaurants[0].id}`);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <p className="text-4xl mb-2">⚙️</p>
          <h1 className="text-2xl font-bold text-gray-900">Console admin</h1>
          <p className="text-gray-500 text-sm mt-1">
            {restaurants.length === 0
              ? "Aucun établissement à administrer pour ce compte."
              : "Choisis l'établissement à gérer."}
          </p>
        </div>

        {restaurants.length > 0 && (
          <div className="bg-white rounded-2xl shadow-xl p-4 space-y-2">
            {restaurants.map((r) => (
              <Link
                key={r.id}
                href={`/admin/${r.id}`}
                className="flex items-center justify-between px-4 py-3 rounded-xl border border-gray-200 hover:border-brand-red transition-colors"
              >
                <span className="font-semibold text-gray-900">{r.name}</span>
                <span className="text-sm font-semibold text-brand-red">Gérer →</span>
              </Link>
            ))}
          </div>
        )}

        <p className="text-center text-sm text-gray-500 mt-5">
          Tu veux inscrire ton propre restaurant ?{" "}
          <Link href="/become-a-partner" className="font-semibold text-brand-red hover:underline">
            Deviens partenaire →
          </Link>
        </p>
      </div>
    </div>
  );
}
