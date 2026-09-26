import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { openShared, slugify } from "@/lib/audit/share";
import type { AuditRow, SectionRow } from "@/lib/audit/store";
import { AuditReport } from "@/components/platform/audit/AuditReport";
import { AutoPrint, PrintButton } from "@/components/platform/audit/PrintButton";
import s from "@/components/platform/audit/report.module.css";

// ADR 0069 §6 — le rapport remis au gérant : boosteats.tech/audit/<nom>/v<N>-<jeton>.
// Lecture seule, version figée, noindex, 90 jours, révocable. Chaque ouverture
// est comptée côté serveur (sauf les nôtres, super-admin) : la console dit si
// le gérant l'a regardé.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Audit de votre restaurant — Boosteats",
  robots: { index: false, follow: false },
};

const REASON = {
  introuvable: "Ce lien ne correspond à aucun rapport.",
  expire: "Ce lien a expiré (un rapport reste consultable 90 jours).",
  revoque: "Ce lien n'est plus actif.",
} as const;

export default async function SharedAuditPage({ params, searchParams }: { params: Promise<{ slug: string; key: string }>; searchParams: Promise<{ pdf?: string }> }) {
  const { slug, key } = await params;
  const { pdf } = await searchParams;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user ? await supabase.from("profiles").select("is_super_admin").eq("id", user.id).maybeSingle() : { data: null };
  const shared = await openShared(key, !profile?.is_super_admin);

  if (!shared.ok) {
    return (
      <div className={s.report} style={{ minHeight: "100vh" }}>
        <div className={s.page}>
          <span className={s.logo}>boost<b>eats</b> · audit</span>
          <div className={s.card} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <b>{REASON[shared.reason]}</b>
            <span className={s.sum} style={{ fontWeight: 500 }}>
              Pour recevoir une version à jour, écrivez-nous : <a href="mailto:contact@boosteats.tech">contact@boosteats.tech</a>.
            </span>
          </div>
        </div>
      </div>
    );
  }

  const canonical = slugify(shared.name);
  if (slug !== canonical) redirect(`/audit/${canonical}/${key}${pdf ? "?pdf=1" : ""}`);

  const { audit, sections } = shared.snapshot;
  return (
    <div style={{ background: "#fff", minHeight: "100vh" }}>
      {pdf && <AutoPrint />}
      <AuditReport
        mode="public"
        audit={{ ...audit, cost_usd: 0, calls: {}, created_by: null } as AuditRow}
        sections={sections.map((x) => ({ ...x, id: x.section, audit_id: audit.id, source: null, error: null, cost_usd: 0, started_at: audit.created_at, finished_at: audit.updated_at }) as SectionRow)}
        toolbar={
          <div className={s.toolbar}>
            <span className={s.logo}>boost<b>eats</b> · audit</span>
            <PrintButton />
          </div>
        }
      />
    </div>
  );
}
