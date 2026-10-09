import { Check } from "lucide-react";
import { Card, PageHeader, SectionLabel, StatusBadge } from "@/components/admin/ui";
import type { BriefTemplate } from "@/lib/mission-brief";
import type { MissionRow } from "@/lib/missions";
import { METIER_LABELS, STATUS_VIEW, briefRows, timeline } from "@/lib/mission-view";

// ADR 0084 — le suivi d'une mission envoyée : la frise (où ça en est, en mots
// de restaurateur) et le brief verrouillé tel que le prestataire l'a reçu.
// Présentation seule : aucune donnée n'est lue ici (testable sans base).
export function MissionTracker({
  mission,
  template,
  providerName,
}: {
  mission: Pick<MissionRow, "metier" | "status" | "brief" | "brief_locked_at">;
  template: BriefTemplate;
  providerName: string | null;
}) {
  const view = STATUS_VIEW[mission.status];
  const tl = timeline(mission.status);
  const rows = briefRows(mission.brief ?? {}, template);
  const lockedOn = mission.brief_locked_at
    ? new Date(mission.brief_locked_at).toLocaleDateString("fr-BE", { day: "numeric", month: "long", timeZone: "Europe/Brussels" })
    : null;

  return (
    <>
      <PageHeader
        title={`${METIER_LABELS[mission.metier]}${typeof mission.brief?.goal === "string" ? ` · ${mission.brief.goal}` : ""}`}
        subtitle={providerName ? `avec ${providerName}` : undefined}
        action={<StatusBadge tone={view.tone}>{view.label}</StatusBadge>}
      />

      <Card className="space-y-4">
        <SectionLabel>Où en est ta mission</SectionLabel>
        <ol className="space-y-3">
          {tl.steps.map((s) => (
            <li key={s.key} className="flex items-center gap-3">
              <span
                className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[12px] ${
                  s.state === "done" ? "bg-boost-olive text-white" : s.state === "current" ? "border-2 border-boost-olive bg-boost-cream" : "border border-paper-border bg-white"
                }`}
                aria-hidden
              >
                {s.state === "done" && <Check className="w-3.5 h-3.5" />}
              </span>
              <span className={`text-[14px] ${s.state === "todo" ? "text-ink-faint" : "text-ink font-semibold"}`}>
                {s.label}
                {s.state === "current" && <span className="sr-only"> (étape en cours)</span>}
              </span>
            </li>
          ))}
        </ol>
        {mission.status === "envoye" && (
          <p className="text-[13.5px] text-ink-muted border-t border-paper-border pt-3">
            {providerName ?? "Le vidéaste"} lit ton brief et te répond avec un devis. Son prix sera ferme. Tu ne paies rien tant que tu n&apos;as pas accepté.
          </p>
        )}
        {tl.stopped && <p className="text-[13.5px] text-ink-muted border-t border-paper-border pt-3">Cette mission est arrêtée : {view.label.toLowerCase()}.</p>}
      </Card>

      <Card padding="p-0">
        <div className="px-5 pt-4">
          <SectionLabel>Ton brief</SectionLabel>
          <p className="text-ink-muted text-[13px] mt-1">
            Verrouillé{lockedOn ? ` le ${lockedOn}` : ""}. Un changement passe par une demande de modification.
          </p>
        </div>
        <dl className="mt-2">
          {rows.map((r, i) => (
            <div key={r.label} className={`px-5 py-3 ${i === 0 ? "" : "border-t border-paper-border"}`}>
              <dt className="text-[12px] text-ink-faint">{r.label}</dt>
              <dd className="text-[14px] text-ink whitespace-pre-line">{r.value}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </>
  );
}
