import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { PendingButton } from "@/components/PendingButton";
import { joinRestaurant } from "./actions";

// ADR 0030 §8 — /join est la destination de plusieurs refus d'autorisation :
// on affiche POURQUOI on atterrit ici au lieu d'une redirection silencieuse.
const REASON_BANNERS: Record<string, { icon: string; title: string; text: string }> = {
  "admin-required": {
    icon: "🔒",
    title: "Section réservée aux restaurateurs",
    text: "Cette console appartient à un autre établissement, ou ton compte n'a pas encore d'accès restaurateur.",
  },
  "platform-required": {
    icon: "🔒",
    title: "Section réservée à l'équipe plateforme",
    text: "La console plateforme n'est accessible qu'aux administrateurs du réseau.",
  },
};

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { reason } = await searchParams;
  const banner = reason ? REASON_BANNERS[reason] : undefined;

  const [{ data: restaurants }, { data: memberships }, { data: ownedRaw }] = await Promise.all([
    supabase.from("restaurants").select("id, name").eq("status", "active").order("name"),
    supabase.from("memberships").select("restaurant_id").eq("user_id", user.id),
    // ADR 0030 §8 — demandes de partenariat du compte : un restaurateur en
    // attente d'approbation voit un état clair au lieu du silence.
    supabase.from("restaurants").select("id, name, status").eq("owner_id", user.id),
  ]);

  const joinedIds = new Set((memberships ?? []).map((m) => m.restaurant_id));
  const pendingOwned = ((ownedRaw as { id: string; name: string; status: string }[] | null) ?? [])
    .filter((o) => o.status === "pending");

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {banner && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4 flex gap-3">
            <span className="text-xl" aria-hidden="true">{banner.icon}</span>
            <div>
              <p className="font-semibold text-amber-900 text-sm">{banner.title}</p>
              <p className="text-amber-700 text-xs mt-0.5">{banner.text}</p>
            </div>
          </div>
        )}

        {pendingOwned.map((o) => (
          <div key={o.id} className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-4 flex gap-3">
            <span className="text-xl" aria-hidden="true">⏳</span>
            <div>
              <p className="font-semibold text-blue-900 text-sm">
                Ta demande pour « {o.name} » est en cours d&apos;examen
              </p>
              <p className="text-blue-700 text-xs mt-0.5">
                On vérifie chaque établissement avant sa mise en ligne — tu seras prévenu dès la validation.
              </p>
            </div>
          </div>
        ))}

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
                  className="inline-flex items-center justify-center bg-brand-red text-white text-sm font-semibold px-5 py-3 min-h-[48px] rounded-xl hover:bg-brand-red/85 transition-colors shrink-0"
                >
                  Ouvrir mon espace →
                </Link>
              ) : (
                <form action={joinRestaurant.bind(null, r.id)}>
                  <PendingButton
                    pendingLabel="Un instant…"
                    className="bg-brand-red text-white text-sm font-semibold px-5 py-3 min-h-[48px] rounded-xl hover:bg-brand-red/85 transition-colors shrink-0"
                  >
                    Rejoindre
                  </PendingButton>
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
