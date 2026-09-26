import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getAudit } from "@/lib/audit/store";
import { listShares, SHARE_ORIGIN } from "@/lib/audit/share";
import { AuditReport } from "@/components/platform/audit/AuditReport";
import { SharePanel } from "@/components/platform/audit/SharePanel";
import { reanalyseCompetitors, reanalyseSeo, reanalyseThemes, revokeAuditShare, saveAnswers, shareAudit } from "../actions";
import { AutoRefresh } from "./AutoRefresh";

export const metadata = { title: "Audit — Plateforme" };
export const dynamic = "force-dynamic";
// « Analyser les thèmes » appelle Claude sur 400 avis (≈ 1 min).
export const maxDuration = 300;

// ADR 0069 §5 — un audit enregistré, affiché comme le rapport remis au gérant
// (maquette validée), avec les détails techniques repliés en bas. En tête : le
// lien partagé et le PDF de la dernière version figée (§6).
export default async function AuditDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ partage?: string; motif?: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  if (!profile?.is_super_admin) redirect("/join?reason=platform-required");

  const { id } = await params;
  const sp = await searchParams;
  const data = await getAudit(id);
  if (!data) notFound();
  const shares = await listShares(data.audit).catch((e) => {
    console.error("[audit/partage] lecture des liens :", e);
    return null;
  });
  const kind = (["ok", "echec", "en_cours"] as const).find((k) => k === sp.partage);
  const flash = kind ? { kind, motif: sp.motif } : null;

  return (
    <>
      <AutoRefresh active={data.audit.status === "en_cours"} />
      <AuditReport
        audit={data.audit}
        sections={data.sections}
        saveAnswers={saveAnswers.bind(null, id)}
        reanalyse={reanalyseThemes.bind(null, id)}
        analyseCompetitors={reanalyseCompetitors.bind(null, id)}
        analyseSeo={reanalyseSeo.bind(null, id)}
        sharePanel={
          <SharePanel
            origin={SHARE_ORIGIN}
            shares={shares}
            freeze={shareAudit.bind(null, id)}
            revoke={revokeAuditShare.bind(null, id)}
            flash={flash}
            disabled={data.audit.status === "en_cours"}
          />
        }
      />
    </>
  );
}
