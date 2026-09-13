import Link from "next/link";
import { listTeamsForAdmin } from "@/lib/teams-admin";
import { TeamsManager } from "@/components/admin/TeamsManager";
import { PageHeader } from "@/components/admin/ui";

export const metadata = { title: "Équipes" };

// ADR 0035 — « Équipes » : la contrepartie de « Communautés » (réglages).
// Là, le restaurateur déclare les noms qu'il connaît ; ici, il voit ce que
// ses clients en ont fait — qui a rejoint quoi, et de quoi faire le ménage.
// La garde d'accès est assurée par le layout admin.
export default async function TeamsPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const teams = await listTeamsForAdmin(restaurantId);

  const actives = teams.filter((t) => t.isActive);
  const membres = teams.reduce((s, t) => s + t.memberCount, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title={<>Équipes</>}
        subtitle={<>{actives.length} équipe{actives.length > 1 ? "s" : ""} active{actives.length > 1 ? "s" : ""} ·{" "}
          {membres} membre{membres > 1 ? "s" : ""} rattaché{membres > 1 ? "s" : ""}</>}
      />

      <div className="bg-paper-subtle border border-paper-border rounded-xl p-4 text-sm text-ink-body">
        Une équipe apparaît quand un client se reconnaît dans une communauté déclarée, ou en crée une lui-même.
        Tu ne peux pas en créer à leur place — c&apos;est le premier « oui » qui la fait naître.{" "}
        <Link href={`/admin/${restaurantId}/settings`} className="font-semibold underline">
          Gérer les communautés proposées
        </Link>
      </div>

      <TeamsManager restaurantId={restaurantId} teams={teams} />
    </div>
  );
}
