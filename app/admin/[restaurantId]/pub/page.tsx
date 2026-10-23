import Link from "next/link";
import { redirect } from "next/navigation";
import { Megaphone } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getAdminAccess } from "@/lib/admin-guard";
import { listRequests, pubAvailability, type RequestView } from "@/lib/ads/requests";
import { formatEur } from "@/lib/ads/money";
import { Card, EmptyState, PageHeader, ProgressBar, SectionLabel, StatusBadge } from "@/components/admin/ui";
import { PauseButton, RechargeForm } from "./PubControls";
import { STATUS_VIEW, dateFr, fr } from "./view";

// ADR 0085 §6 + ADR 0086 — la Pub du restaurateur : ses campagnes, le résultat de
// chacune selon son objectif, la dépense et le budget restant. Euros permis : c'est sa
// dépense, en console (ADR 0007 ne protège que le membre). Maquette validée le 2026-10-23.

export const dynamic = "force-dynamic";

export default async function PubPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const access = await getAdminAccess(user.id, restaurantId);
  const av = await pubAvailability(restaurantId, access.isSuperAdmin);
  const base = `/admin/${restaurantId}/pub`;

  const header = <PageHeader title="Pub" subtitle="Des pubs Facebook et Instagram autour du resto, signées par ta page." />;
  if (!av.open) {
    return (
      <div className="space-y-6 max-w-2xl">
        {header}
        <EmptyState icon={Megaphone} title="Bientôt chez toi">
          {av.reason === "config" && access.isSuperAdmin ? `Configuration manquante : ${av.missing.join(", ")}` : "La Pub s'ouvre établissement par établissement. On te prévient dès qu'elle est prête pour toi."}
        </EmptyState>
      </div>
    );
  }

  const list = await listRequests(restaurantId);
  const requests = list.ok ? list.requests.filter((r) => r.status !== "annulee") : [];
  const live = requests.filter((r) => ["en_diffusion", "en_pause"].includes(r.status));
  const pending = requests.filter((r) => ["paiement_attendu", "payee", "preparee", "a_corriger"].includes(r.status));
  const ended = requests.filter((r) => r.status === "terminee");

  return (
    <div className="space-y-6 max-w-2xl">
      {header}
      {!av.identity.pageName && (
        <p className="text-[13px] text-ink-muted">On relie ta page Facebook à Boosteats : tu peux déjà demander ta pub.</p>
      )}

      {live.map((r) => (
        <Card key={r.id} className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <SectionLabel tone="muted">{r.objectiveLabel}</SectionLabel>
            <StatusBadge tone={STATUS_VIEW[r.status].tone} solid={STATUS_VIEW[r.status].solid}>{STATUS_VIEW[r.status].label}</StatusBadge>
          </div>
          <CreativeLine r={r} />
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-boost-cream p-3">
              <p className="font-display text-2xl font-bold tabular-nums text-ink">{fr(r.results)}</p>
              <p className="text-[13px] text-boost-olive-dark">{r.resultLabel}</p>
            </div>
            <div className="rounded-lg bg-paper-subtle p-3">
              <p className="font-display text-2xl font-bold tabular-nums text-ink">{fr(r.reach)}</p>
              <p className="text-[13px] text-ink-muted">personnes touchées</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between gap-2 text-[14px] text-ink">
              <span>Dépensé <strong>{formatEur(r.spentCents)}</strong> sur {formatEur(r.paidCents)}</span>
              <span className="text-ink-muted">reste {formatEur(Math.max(0, r.paidCents - r.spentCents))}</span>
            </div>
            <ProgressBar value={r.spentCents} max={r.paidCents} label="Budget dépensé" />
            {r.daysLeft !== null && <p className="text-[13px] text-ink-muted">Au rythme actuel : encore environ {Math.max(1, Math.round(r.daysLeft))} jour{Math.round(r.daysLeft) > 1 ? "s" : ""}.</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <RechargeForm restaurantId={restaurantId} requestId={r.id} hasOpenNotice={r.notices.some((n) => !n.confirmedAt)} />
            <PauseButton restaurantId={restaurantId} requestId={r.id} paused={r.status === "en_pause"} />
          </div>
        </Card>
      ))}

      {pending.map((r) => (
        <Card key={r.id} className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-[14px] text-ink">{r.objectiveLabel}</p>
            <p className="text-[13px] text-ink-muted">
              {STATUS_VIEW[r.status].label}
              {r.status === "paiement_attendu" && r.notices[0] ? ` · ${formatEur(r.notices[0].expectedCents)}` : ""}
            </p>
          </div>
          <Link href={`${base}/${r.id}`} className="text-[14px] font-semibold text-boost-olive-dark hover:text-ink">
            {r.status === "paiement_attendu" ? "Voir le virement" : r.status === "a_corriger" ? "Retoucher" : "Détails"}
          </Link>
        </Card>
      ))}

      {ended.length > 0 && (
        <section className="space-y-3">
          <SectionLabel tone="muted">Terminées</SectionLabel>
          {ended.map((r) => (
            <Card key={r.id} className="space-y-1">
              <div className="flex justify-between gap-2">
                <span className="font-semibold text-[14px] text-ink">{r.objectiveLabel}</span>
                <StatusBadge>Terminée</StatusBadge>
              </div>
              <p className="text-[13px] text-ink-muted">
                {fr(r.results)} {r.resultLabel} · {formatEur(r.spentCents)} dépensés · {dateFr(r.startsOn)} → {dateFr(r.endsOn)}
              </p>
              <div className="flex flex-wrap gap-3 pt-1">
                <RechargeForm restaurantId={restaurantId} requestId={r.id} hasOpenNotice={r.notices.some((n) => !n.confirmedAt)} label="Relancer avec du budget" />
              </div>
            </Card>
          ))}
        </section>
      )}

      {requests.length === 0 && (
        <EmptyState icon={Megaphone} title="Ta première pub">
          Choisis une publication, une zone autour du resto et un budget à partir de 100 €. Tu paies par virement, on s&apos;occupe du reste.
        </EmptyState>
      )}

      <Link href={`${base}/nouvelle`} className="block w-full rounded-xl bg-ink px-4 py-3.5 text-center text-[15px] font-semibold text-white hover:bg-ink-body">
        Nouvelle pub
      </Link>
      <p className="text-center text-[12px] text-ink-faint">Chiffres de Meta, mis à jour chaque matin.</p>
    </div>
  );
}

function CreativeLine({ r }: { r: RequestView }) {
  const thumb = r.creative?.thumbnail ?? null;
  return (
    <div className="flex items-center gap-3">
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-paper-subtle">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-[11px] text-ink-muted">{r.creative?.kind === "upload" ? "Fichier" : "Post"}</div>}
      </div>
      <div className="min-w-0">
        <p className="truncate text-[15px] font-semibold text-ink">{r.adText ?? r.objectiveLabel}</p>
        <p className="text-[13px] text-ink-muted">
          {r.radiusKm ? `${r.radiusKm} km autour du resto · ` : ""}du {dateFr(r.startsOn)} au {dateFr(r.endsOn)}
        </p>
      </div>
    </div>
  );
}
