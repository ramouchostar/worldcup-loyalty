import { redirect } from "next/navigation";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { listBacklog } from "@/lib/backlog";
import { BacklogBoard } from "./BacklogBoard";

export const metadata = { title: "Backlog — Plateforme" };

export const dynamic = "force-dynamic";

// ADR 0033 §3 — le plan d'action des associés vit DANS la console, pas dans un
// Trello à côté : les décisions se prennent devant les chiffres (/platform/stats)
// et un item peut pointer l'établissement concerné. Un outil externe se
// désynchronise du produit en quelques semaines.
export default async function PlatformBacklogPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  if (!profile?.is_super_admin) redirect("/join?reason=platform-required");

  const admin = createAdminClient();
  const [items, { data: restaurantsRaw }] = await Promise.all([
    listBacklog(),
    admin.from("restaurants").select("id, name").order("name"),
  ]);
  const restaurants = ((restaurantsRaw as { id: string; name: string }[] | null) ?? []);

  return (
    // max-w-7xl et non le max-w-3xl d'origine : le backlog se travaille
    // surtout au clavier/souris (Mehdi/Omar), le mobile sert à consulter et
    // attribuer — la page doit utiliser la largeur d'un écran desktop plutôt
    // que rester en colonne étroite avec du vide à droite.
    <div className="max-w-7xl mx-auto px-4 py-5 space-y-3">
      {/* Sous-titre retiré et titre resserré (redesign résumé) — gagner de la
          hauteur d'écran pour BacklogSummary (comptes, prochaine action,
          clôturées), qui porte maintenant seul le contexte de la page. */}
      <h1 className="text-xl font-bold text-gray-900">Backlog</h1>
      <BacklogBoard items={items} restaurants={restaurants} />
    </div>
  );
}
