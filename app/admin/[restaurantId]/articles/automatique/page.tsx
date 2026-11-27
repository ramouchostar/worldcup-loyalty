import { AutoSettingsForm } from "@/components/admin/articles/AutoSettingsForm";
import { BackLink } from "@/components/admin/articles/ui";
import { PageHeader, Restricted } from "@/components/admin/ui";
import { kindChoices } from "@/lib/restaurant-posts/auto/overview";
import { productionSources } from "@/lib/restaurant-posts/auto/sources";
import { dayLabel } from "@/lib/restaurant-posts/view";
import { loadAuto, openConsole, restaurantHasPosition } from "../load";

export const metadata = { title: "Publication automatique" };
export const dynamic = "force-dynamic";

// ADR 0112 — activer, régler ou arrêter la publication automatique. Gérant ou manager.

export default async function AutoArticlesPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const { canSee, canWrite } = await openConsole(restaurantId);
  if (!canSee) return <Restricted />;
  const [auto, hasPosition] = await Promise.all([loadAuto(restaurantId), restaurantHasPosition(restaurantId)]);

  return (
    <div className="max-w-2xl space-y-4">
      <BackLink href={`/admin/${restaurantId}/articles`} label="Mes articles" />
      <PageHeader
        title="Publication automatique"
        subtitle="On écrit un article à chaque belle occasion. On te prévient la veille à 17 h. Si tu ne dis rien, il est publié à 10 h."
      />
      {auto.state === "off" ? (
        <p role="status" className="rounded-lg bg-warn/10 px-3 py-2 text-[15px] text-ink">La publication automatique n&apos;est pas encore activée sur Boosteats. Tes articles écrits à la main marchent comme avant.</p>
      ) : auto.state === "failed" ? (
        <p role="alert" className="text-[15px] text-danger">Impossible de lire le réglage pour le moment. Recharge la page.</p>
      ) : !canWrite ? (
        <p className="text-[15px] text-ink">
          {auto.active ? "Publication automatique activée." : "Publication automatique éteinte."}{" "}
          Seul le restaurant peut l&apos;activer, la régler ou l&apos;arrêter.
        </p>
      ) : (
        <AutoSettingsForm
          key={auto.settings?.updated_at ?? "neuf"}
          restaurantId={restaurantId}
          active={auto.active}
          activeSince={auto.active && auto.settings?.accepted_at ? dayLabel(auto.settings.accepted_at) : null}
          initial={auto.settings?.kinds ?? []}
          choices={kindChoices(productionSources(), hasPosition)}
        />
      )}
    </div>
  );
}
