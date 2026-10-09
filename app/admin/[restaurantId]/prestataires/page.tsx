import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Camera, ChevronRight, Clapperboard, PenTool, Printer, Wrench } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getAdminAccess } from "@/lib/admin-guard";
import { listMissions, marketplaceEnabled } from "@/lib/missions";
import { STATUS_VIEW, METIER_LABELS } from "@/lib/mission-view";
import { EmptyState, PageHeader, StatusBadge, Card, CardRow, SectionLabel } from "@/components/admin/ui";
import { NewBriefButton } from "./NewBriefButton";

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

  const result = await listMissions(restaurantId);
  const base = `/admin/${restaurantId}/prestataires`;

  const services = [
    { metier: "video" as const, icon: Clapperboard, desc: "Reels, film, pack du mois : un vidéaste vient chez toi.", open: true },
    { metier: "photo" as const, icon: Camera, desc: "Tes plats, ta salle, ton équipe.", open: false },
    { metier: "design" as const, icon: PenTool, desc: "Menu, flyer, affiche, logo.", open: false },
    { metier: "impression" as const, icon: Printer, desc: "Menus, flyers, chevalets, QR codes.", open: false },
  ];

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader title="Prestataires" subtitle="Des professionnels de confiance pour tes vidéos, tes photos et tes supports. Un brief clair, un devis ferme, zéro aller-retour." />

      <section className="space-y-3">
        <SectionLabel>Ce que tu peux réserver</SectionLabel>
        <div className="grid gap-3 sm:grid-cols-2">
          {services.map((s) => (
            <Card key={s.metier} className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <span className="w-10 h-10 shrink-0 rounded-lg bg-boost-cream text-boost-olive-dark flex items-center justify-center">
                  <s.icon className="w-5 h-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{METIER_LABELS[s.metier]}</p>
                  <p className="text-[13px] text-ink-muted">{s.desc}</p>
                </div>
              </div>
              {s.open ? (
                <NewBriefButton restaurantId={restaurantId} metier={s.metier} label="Commencer mon brief" />
              ) : (
                <StatusBadge className="self-start">Bientôt</StatusBadge>
              )}
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <SectionLabel>Mes missions</SectionLabel>
        {!result.ok ? (
          <EmptyState icon={Wrench} title="Le service n'est pas encore ouvert">
            Rien ne cloche chez toi : on finit de le mettre en place. Reviens bientôt.
          </EmptyState>
        ) : result.missions.length === 0 ? (
          <EmptyState icon={Clapperboard} title="Aucune mission pour l'instant">
            Commence par ton brief vidéo : il se remplit en quelques minutes et se sauvegarde tout seul.
          </EmptyState>
        ) : (
          <Card padding="p-0">
            {result.missions.map((m, i) => {
              const view = STATUS_VIEW[m.status];
              return (
                <CardRow key={m.id} first={i === 0}>
                  <Link href={`${base}/${m.id}`} className="flex items-center gap-3 min-h-[44px]">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ink text-[14px] truncate">
                        {METIER_LABELS[m.metier]}
                        {typeof m.brief?.goal === "string" ? ` · ${m.brief.goal}` : ""}
                      </p>
                      <p className="text-[12.5px] text-ink-faint">
                        {m.status === "brief" ? "Brouillon commencé le " : "Créée le "}
                        {new Date(m.created_at).toLocaleDateString("fr-BE", { day: "numeric", month: "long", timeZone: "Europe/Brussels" })}
                      </p>
                    </div>
                    <StatusBadge tone={view.tone}>{view.label}</StatusBadge>
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
