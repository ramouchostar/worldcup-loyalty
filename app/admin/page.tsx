import Link from "next/link";
import { Store } from "lucide-react";
import { redirect } from "next/navigation";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { getRestaurantId, getRestaurantLogos } from "@/lib/restaurant";
import { getAdminRestaurantIds } from "@/lib/restaurant-admins";
import { RestaurantMark } from "@/components/admin/RestaurantMark";

export default async function AdminLandingPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  // ADR 0041 — owner_id ∪ sièges restaurant_admins (gérant/manager/équipe) :
  // un manager ou un siège équipe administre aussi son établissement sans en
  // être owner_id.
  const [adminRestaurantIds, { data: profile }] = await Promise.all([
    getAdminRestaurantIds(user.id),
    admin.from("profiles").select("is_admin").eq("id", user.id).single(),
  ]);

  const { data: adminRestaurants } =
    adminRestaurantIds.length > 0
      ? await admin.from("restaurants").select("id, name").in("id", adminRestaurantIds).order("name")
      : { data: [] };

  const restaurants = [...(adminRestaurants ?? [])];

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

  // ADR 0015 — on choisit son établissement au logo, pas à la lecture d'une
  // liste de noms : c'est exactement l'écran où la confusion coûte cher
  // (valider les commandes du mauvais resto).
  const logos = await getRestaurantLogos(restaurants.map((r) => r.id));

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <span className="w-12 h-12 rounded-xl bg-paper-subtle text-ink-muted flex items-center justify-center mx-auto mb-3">
            <Store size={24} strokeWidth={1.6} aria-hidden="true" />
          </span>
          <h1 className="font-display text-2xl font-bold tracking-[-0.02em] text-ink">Console admin</h1>
          <p className="text-ink-muted text-sm mt-1">
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
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-paper-border hover:border-ink transition-colors"
              >
                <RestaurantMark
                  name={r.name}
                  logoUrl={logos[r.id] ?? null}
                  className={logos[r.id] ? "border border-paper-border" : ""}
                />
                <span className="font-semibold text-ink flex-1 min-w-0 truncate">{r.name}</span>
                <span className="text-sm font-semibold text-ink shrink-0">Gérer →</span>
              </Link>
            ))}
          </div>
        )}

        <p className="text-center text-sm text-ink-muted mt-5">
          Tu veux inscrire ton propre restaurant ?{" "}
          <Link href="/become-a-partner" className="font-semibold text-ink hover:underline">
            Deviens partenaire →
          </Link>
        </p>
      </div>
    </div>
  );
}
