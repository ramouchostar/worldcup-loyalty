import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getEstablishmentFeedback } from "@/lib/feedback";
import { barometerFromItems } from "@/lib/barometer";
import { QualityFeedbackAdmin } from "@/components/admin/QualityFeedbackAdmin";

export const metadata = { title: "Baromètre de confiance" };

// ADR 0023 — écran RESTO (owner). L'accès /admin/[restaurantId] est déjà gardé
// par le middleware (admin établissement = owner + legacy + super). Le baromètre
// et les signalements ne sont JAMAIS exposés au membre (§1).
export default async function AdminQualityPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const items = await getEstablishmentFeedback(restaurantId);
  const barometer = barometerFromItems(
    items.map((i) => ({ sentiment: i.sentiment, status: i.status, dimensions: i.dimensions, createdAt: i.createdAt })),
    new Date()
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Baromètre de confiance</h1>
        <p className="text-gray-500 text-sm mt-1">
          Ce que tes clients te disent en privé — encouragements et signalements.
          Visible par toi seul, jamais par le client.
        </p>
      </div>
      <QualityFeedbackAdmin restaurantId={restaurantId} barometer={barometer} items={items} />
    </div>
  );
}
