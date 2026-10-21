import Link from "next/link";
import { ChevronLeft, Hourglass } from "lucide-react";
import { requireProviderPage } from "@/lib/providers";
import { loadProfile } from "@/lib/providers-profile";
import { EmptyState, PageHeader } from "@/components/admin/ui";
import { getProviderLocale } from "@/lib/provider-locale";
import { getT } from "@/lib/i18n";
import { ProfileForm } from "./ProfileForm";

export const dynamic = "force-dynamic";

// ADR 0084 §2 bis — « Mon profil » : ce que le restaurateur lit avant de te confier un brief.
export default async function ProviderProfilePage() {
  const { provider } = await requireProviderPage();
  const { t } = getT(await getProviderLocale(provider.id));
  const loaded = await loadProfile(provider.id);

  return (
    <div className="space-y-5">
      <Link href="/prestataire" className="inline-flex items-center gap-1 text-[13px] text-ink-muted hover:text-ink min-h-[44px]">
        <ChevronLeft className="w-4 h-4" aria-hidden /> {t("profile.back")}
      </Link>
      <PageHeader title={t("profile.title")} subtitle={t("profile.subtitle")} />
      {loaded.ok ? (
        <ProfileForm name={provider.display_name} initial={loaded.profile} />
      ) : (
        <EmptyState icon={Hourglass} title={t("profile.unavailable.title")}>
          {t("profile.unavailable.body")}
        </EmptyState>
      )}
    </div>
  );
}
