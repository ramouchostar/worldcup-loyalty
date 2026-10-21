import Link from "next/link";
import { ChevronLeft, Hourglass } from "lucide-react";
import { requireProviderPage } from "@/lib/providers";
import { loadProfile } from "@/lib/providers-profile";
import { EmptyState, PageHeader } from "@/components/admin/ui";
import { ProfileForm } from "./ProfileForm";

export const dynamic = "force-dynamic";

// ADR 0084 §2 bis — « Mon profil » : ce que le restaurateur lit avant de te confier un brief.
export default async function ProviderProfilePage() {
  const { provider } = await requireProviderPage();
  const loaded = await loadProfile(provider.id);

  return (
    <div className="space-y-5">
      <Link href="/prestataire" className="inline-flex items-center gap-1 text-[13px] text-ink-muted hover:text-ink min-h-[44px]">
        <ChevronLeft className="w-4 h-4" aria-hidden /> Mes missions
      </Link>
      <PageHeader title="Mon profil" subtitle="Dis ce que tu fais, et surtout ce que tu ne fais pas : ça évite les malentendus. Pas de téléphone ni d'e-mail : tout passe par Boosteats." />
      {loaded.ok ? (
        <ProfileForm name={provider.display_name} initial={loaded.profile} />
      ) : (
        <EmptyState icon={Hourglass} title="Le profil n'est pas encore disponible">
          Rien ne cloche chez toi : on finit de le mettre en place. Reviens bientôt.
        </EmptyState>
      )}
    </div>
  );
}
