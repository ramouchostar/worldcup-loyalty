import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { PlatformHeader } from "@/components/platform/PlatformHeader";

export const metadata = { title: "Console plateforme" };

// ADR 0033 §4 — garde unique de l'espace plateforme. Chaque page conserve son
// propre contrôle `is_super_admin` : un layout Next.js ne protège pas les
// Server Actions ni les requêtes d'une page, il ne fait qu'encadrer le rendu.
// Ce garde-ci évite surtout d'afficher la chrome de la console à quelqu'un qui
// n'y a pas droit avant de le rediriger.
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_super_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_super_admin) redirect("/join?reason=platform-required");

  // ADR 0030 §2 — sortie de la console : retour vers l'app membre (dernier
  // établissement rejoint), /join si le super-admin n'est membre nulle part.
  const { data: myMembership } = await supabase
    .from("memberships")
    .select("restaurant_id")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div className="min-h-screen bg-gray-50">
      <PlatformHeader backHref={myMembership ? `/r/${myMembership.restaurant_id}/dashboard` : "/join"} />
      {children}
    </div>
  );
}
