import Link from "next/link";
import { CalendarDays, ChevronRight, Inbox, Wrench } from "lucide-react";
import { requireProviderPage } from "@/lib/providers";
import { unreadCounts } from "@/lib/missions-messages";
import { listForProvider, type ProviderMissionRow } from "@/lib/provider-missions";
import { METIER_LABELS, PROVIDER_STATUS_VIEW, briefHeadline } from "@/lib/mission-view";
import type { MissionStatus } from "@/lib/mission-states";
import { Card, CardRow, EmptyState, PageHeader, SectionLabel, StatusBadge } from "@/components/admin/ui";

// ADR 0084 — la boîte du prestataire : ce qui attend un devis d'abord, puis le reste.
const TO_QUOTE: MissionStatus[] = ["envoye"];
const ACTIVE: MissionStatus[] = ["devis", "accepte", "date_bloquee", "production", "livre", "retouche", "suspendu", "litige"];

export default async function ProviderInbox() {
  const { provider } = await requireProviderPage();
  const result = await listForProvider(provider.id);
  const unread = result.ok ? await unreadCounts(result.missions.map((m) => m.id), "provider") : new Map<string, number>();

  if (!result.ok) {
    return (
      <EmptyState icon={Wrench} title="Le service n'est pas encore ouvert">
        Rien ne cloche chez toi : on finit de le mettre en place. Reviens bientôt.
      </EmptyState>
    );
  }

  const toQuote = result.missions.filter((m) => TO_QUOTE.includes(m.status));
  const active = result.missions.filter((m) => ACTIVE.includes(m.status));
  const done = result.missions.filter((m) => !TO_QUOTE.includes(m.status) && !ACTIVE.includes(m.status));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mes missions"
        subtitle="Un brief complet, un devis ferme. Lis, chiffre, fixe ta date."
        action={
          <Link href="/prestataire/disponibilites" className="inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-lg border border-paper-border bg-white text-[14px] font-semibold text-ink">
            <CalendarDays className="w-4 h-4" aria-hidden /> Mes disponibilités
          </Link>
        }
      />
      {result.missions.length === 0 ? (
        <EmptyState icon={Inbox} title="Aucun brief pour l'instant">
          Dès qu&apos;un restaurateur t&apos;envoie un brief, il apparaît ici et tu reçois un e-mail.
        </EmptyState>
      ) : (
        <>
          <Section title="À chiffrer" missions={toQuote} unread={unread} emptyText="Rien à chiffrer : tu es à jour." />
          {active.length > 0 && <Section title="En cours" missions={active} unread={unread} />}
          {done.length > 0 && <Section title="Terminées" missions={done} unread={unread} />}
        </>
      )}
    </div>
  );
}

function Section({ title, missions, unread, emptyText }: { title: string; missions: ProviderMissionRow[]; unread: Map<string, number>; emptyText?: string }) {
  return (
    <section className="space-y-3">
      <SectionLabel>{title}</SectionLabel>
      {missions.length === 0 ? (
        <p className="text-[13.5px] text-ink-muted">{emptyText}</p>
      ) : (
        <Card padding="p-0">
          {missions.map((m, i) => {
            const view = PROVIDER_STATUS_VIEW[m.status];
            const n = unread.get(m.id) ?? 0;
            return (
              <CardRow key={m.id} first={i === 0}>
                <Link href={`/prestataire/mission/${m.id}`} className="flex items-center gap-3 min-h-[44px]">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink text-[14px] truncate">{m.restaurant_name}</p>
                    <p className="text-[12.5px] text-ink-faint truncate">
                      {METIER_LABELS[m.metier]}
                      {briefHeadline(m.brief) ? ` · ${briefHeadline(m.brief)}` : ""}
                      {typeof m.brief?.format === "string" ? ` · ${m.brief.format}` : ""}
                    </p>
                  </div>
                  {n > 0 && <span className="shrink-0 inline-flex items-center rounded-full bg-boost-olive text-white text-[11px] font-bold px-2 py-0.5">{n} message{n > 1 ? "s" : ""}</span>}
                  <StatusBadge tone={view.tone}>{view.label}</StatusBadge>
                  <ChevronRight className="w-4 h-4 text-ink-faint shrink-0" aria-hidden />
                </Link>
              </CardRow>
            );
          })}
        </Card>
      )}
    </section>
  );
}
