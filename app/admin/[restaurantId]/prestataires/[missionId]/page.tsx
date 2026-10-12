import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, Hourglass } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getAdminAccess } from "@/lib/admin-guard";
import { getMission, getProviderName, loadTemplate, marketplaceEnabled } from "@/lib/missions";
import { VIDEO_BRIEF_STEPS } from "@/lib/mission-brief";
import { METIER_LABELS } from "@/lib/mission-view";
import { EmptyState, PageHeader } from "@/components/admin/ui";
import { todayInBrussels } from "@/lib/qr-funnel";
import { BriefWizard } from "./BriefWizard";
import { MissionTracker } from "./MissionTracker";
import { QuoteCard } from "./QuoteCard";
import { getCurrentQuote } from "@/lib/provider-missions";
import { getPlan } from "@/lib/entitlements";
import { restaurantView } from "@/lib/mission-quote";

// ADR 0084 — une mission : l'assistant de brief tant que c'est un brouillon,
// puis le suivi (frise, brief verrouillé) une fois envoyée.
export default async function MissionPage({ params }: { params: Promise<{ restaurantId: string; missionId: string }> }) {
  const { restaurantId, missionId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const access = await getAdminAccess(user.id, restaurantId);
  if (!marketplaceEnabled(access.isSuperAdmin)) notFound();

  const found = await getMission(missionId, restaurantId);
  if (!found.ok) {
    return (
      <div className="space-y-6 max-w-xl">
        <PageHeader title="Prestataires" />
        <EmptyState icon={Hourglass} title="Le service n'est pas encore ouvert">
          Reviens bientôt : on finit de le mettre en place.
        </EmptyState>
      </div>
    );
  }
  const mission = found.mission;
  if (!mission) notFound();

  const tpl = await loadTemplate(mission.metier);
  if (!tpl) notFound();
  const providerName = await getProviderName(mission.provider_id);
  const back = (
    <Link href={`/admin/${restaurantId}/prestataires`} className="inline-flex items-center gap-1 text-[13px] text-ink-muted hover:text-ink min-h-[44px]">
      <ChevronLeft className="w-4 h-4" aria-hidden /> Prestataires
    </Link>
  );

  if (mission.status === "brief") {
    return (
      <div className="space-y-4">
        {back}
        <PageHeader title={`Ton brief ${METIER_LABELS[mission.metier].toLowerCase()}`} subtitle="Dis-nous ce que tu veux filmer. Quelques questions, et tout se sauvegarde tout seul." />
        <BriefWizard
          restaurantId={restaurantId}
          missionId={mission.id}
          template={tpl.template}
          steps={VIDEO_BRIEF_STEPS}
          initialAnswers={mission.brief ?? {}}
          today={todayInBrussels()}
          providerName={providerName}
        />
      </div>
    );
  }

  // Le devis reçu, au prix que PAIE ce restaurateur selon son plan d'aujourd'hui (figé au paiement, pas ici).
  const quote = mission.status === "devis" ? await getCurrentQuote(mission.id) : null;
  const plan = quote ? await getPlan(restaurantId) : null;
  const priceView = quote && plan ? restaurantView(quote.price_cents, plan) : null;
  const budget = typeof mission.brief?.budget_cents === "number" ? mission.brief.budget_cents : null;

  return (
    <div className="space-y-6 max-w-xl">
      {back}
      <MissionTracker mission={mission} template={tpl.template} providerName={providerName} />
      {quote && priceView && (
        <QuoteCard
          restaurantId={restaurantId}
          missionId={mission.id}
          providerName={providerName}
          quote={{ hours: quote.hours, deliveryDays: quote.delivery_days, included: quote.included, excluded: quote.excluded, hypotheses: quote.hypotheses }}
          view={{ paidCents: priceView.paidCents, depositCents: priceView.depositCents, balanceCents: priceView.balanceCents, depositPct: priceView.depositBps / 100 }}
          budgetCents={budget}
          canDecline
        />
      )}
    </div>
  );
}
