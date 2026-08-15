import { redirect } from "next/navigation";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { listBacklog } from "@/lib/backlog";
import { OPEN_STATUSES, priorityScore, sortByPriority } from "@/lib/backlog-model";
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

  const open = items.filter((i) => OPEN_STATUSES.includes(i.status));
  const next = sortByPriority(open.filter((i) => i.status !== "bloque"))[0] ?? null;

  return (
    <div className="max-w-3xl mx-auto space-y-5 py-8 px-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Backlog</h1>
        <p className="text-gray-500 text-sm mt-1">
          Ce qu&apos;on doit décider et faire, à deux. La priorité n&apos;est pas saisie : elle se
          calcule (impact ÷ effort), pour que la comparaison entre deux actions soit forcée.
        </p>
      </div>

      {next && (
        <div className="bg-brand-dark text-white rounded-2xl p-5">
          <p className="text-xs text-brand-gold font-semibold uppercase tracking-wide">Prochaine action</p>
          <p className="font-bold text-lg mt-1">{next.title}</p>
          <p className="text-xs text-gray-400 mt-1">
            impact {next.impact} / effort {next.effort} — score {priorityScore(next).toFixed(1)}
            {next.owner && <> · {next.owner}</>}
          </p>
        </div>
      )}

      <BacklogBoard items={items} restaurants={restaurants} />
    </div>
  );
}
