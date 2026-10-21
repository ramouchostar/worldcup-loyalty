import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Camera, ChevronRight, Clapperboard, PenTool, Printer, Wrench } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getAdminAccess } from "@/lib/admin-guard";
import { listMissions, marketplaceEnabled } from "@/lib/missions";
import { STATUS_VIEW, briefHeadline } from "@/lib/mission-view";
import { getUserLocale } from "@/lib/user-locale";
import { LOCALE_TAG, getT, type MessageKey } from "@/lib/i18n";
import { EmptyState, PageHeader, StatusBadge, Card, CardRow, SectionLabel } from "@/components/admin/ui";
import { NewBriefButton } from "./NewBriefButton";
import { unreadCounts } from "@/lib/missions-messages";

// ADR 0084 — « Prestataires » : réserver un vidéaste (puis photographe, graphiste,
// imprimeur). Accueil du module : ce qu'on peut commander, et mes missions.
// Caché tant que MARKETPLACE_ENABLED n'est pas « true » (le super-admin le voit).
export default async function PrestatairesPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const access = await getAdminAccess(user.id, restaurantId);
  if (!marketplaceEnabled(access.isSuperAdmin)) notFound();
  const locale = await getUserLocale(user.id);
  const tr = getT(locale);
  const { t } = tr;

  const result = await listMissions(restaurantId);
  const unread = result.ok ? await unreadCounts(result.missions.map((m) => m.id), "restaurant") : new Map<string, number>();
  const base = `/admin/${restaurantId}/prestataires`;

  const services = [
    { metier: "video" as const, icon: Clapperboard, open: true },
    { metier: "photo" as const, icon: Camera, open: true },
    { metier: "design" as const, icon: PenTool, open: true },
    { metier: "impression" as const, icon: Printer, open: true },
  ];

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader title={t("rest.list.title")} subtitle={t("rest.list.subtitle")} />

      <section className="space-y-3">
        <SectionLabel>{t("rest.list.canBook")}</SectionLabel>
        <div className="grid gap-3 sm:grid-cols-2">
          {services.map((s) => (
            <Card key={s.metier} className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <span className="w-10 h-10 shrink-0 rounded-lg bg-boost-cream text-boost-olive-dark flex items-center justify-center">
                  <s.icon className="w-5 h-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{t(`metier.${s.metier}` as MessageKey)}</p>
                  <p className="text-[13px] text-ink-muted">{t(`rest.list.desc.${s.metier}` as MessageKey)}</p>
                </div>
              </div>
              {s.open ? (
                <NewBriefButton restaurantId={restaurantId} metier={s.metier} label={t("rest.list.start")} />
              ) : (
                <StatusBadge className="self-start">{t("rest.list.soon")}</StatusBadge>
              )}
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <SectionLabel>{t("rest.list.mine")}</SectionLabel>
        {!result.ok ? (
          <EmptyState icon={Wrench} title={t("rest.list.notOpen.title")}>
            {t("rest.list.notOpen.body")}
          </EmptyState>
        ) : result.missions.length === 0 ? (
          <EmptyState icon={Clapperboard} title={t("rest.list.empty.title")}>
            {t("rest.list.empty.body")}
          </EmptyState>
        ) : (
          <Card padding="p-0">
            {result.missions.map((m, i) => {
              const view = STATUS_VIEW[m.status];
              const n = unread.get(m.id) ?? 0;
              return (
                <CardRow key={m.id} first={i === 0}>
                  <Link href={`${base}/${m.id}`} className="flex items-center gap-3 min-h-[44px]">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ink text-[14px] truncate">
                        {t(`metier.${m.metier}` as MessageKey)}
                        {briefHeadline(m.brief) ? ` · ${briefHeadline(m.brief)}` : ""}
                      </p>
                      <p className="text-[12.5px] text-ink-faint">
                        {t(m.status === "brief" ? "rest.list.draftOn" : "rest.list.createdOn", { date: new Date(m.created_at).toLocaleDateString(LOCALE_TAG[locale], { day: "numeric", month: "long", timeZone: "Europe/Brussels" }) })}
                      </p>
                    </div>
                    {n > 0 && <span className="shrink-0 inline-flex items-center rounded-full bg-boost-olive text-white text-[11px] font-bold px-2 py-0.5">{tr.tp("inbox.unread", n)}</span>}
                    <StatusBadge tone={view.tone}>{t(`status.restaurant.${m.status}` as MessageKey)}</StatusBadge>
                    <ChevronRight className="w-4 h-4 text-ink-faint shrink-0" aria-hidden />
                  </Link>
                </CardRow>
              );
            })}
          </Card>
        )}
      </section>
    </div>
  );
}
