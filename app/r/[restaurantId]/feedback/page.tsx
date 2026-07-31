import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getMyFeedback, isEligibleForFeedback } from "@/lib/feedback";
import { FeedbackClient } from "@/components/member/FeedbackClient";

export const metadata = { title: "Mon resto" };

// ADR 0023 — surface membre du canal qualité privé : encourager / signaler +
// « Mes retours » et fils de discussion médiés. Aucun baromètre d'établissement
// n'est jamais affiché ici (réservé au restaurateur, §1).
export default async function FeedbackPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [eligible, mine] = await Promise.all([
    isEligibleForFeedback(user.id, restaurantId),
    getMyFeedback(user.id),
  ]);

  // Le membre peut être multi-établissement : on ne montre que CET établissement.
  const feedback = mine.feedback.filter((f) => f.restaurant_id === restaurantId);
  const ids = new Set(feedback.map((f) => f.id));
  const messages = mine.messages.filter((m) => ids.has(m.feedback_id));

  return (
    <div className="space-y-5 pb-4">
      <div>
        <h1 className="text-2xl font-bold text-brand-dark">Mon resto</h1>
        <p className="text-gray-500 text-sm mt-1">
          Un espace privé, entre toi et ton resto. Encourage-le ou signale-lui un souci.
        </p>
      </div>
      <FeedbackClient restaurantId={restaurantId} eligible={eligible} feedback={feedback} messages={messages} />
    </div>
  );
}
