import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getAudit } from "@/lib/audit/store";
import { AuditReport } from "@/components/platform/audit/AuditReport";
import { reanalyseCompetitors, reanalyseThemes, saveAnswers } from "../actions";
import { AutoRefresh } from "./AutoRefresh";

export const metadata = { title: "Audit — Plateforme" };
export const dynamic = "force-dynamic";
// « Analyser les thèmes » appelle Claude sur 400 avis (≈ 1 min).
export const maxDuration = 300;

// ADR 0069 §5 — un audit enregistré, affiché comme le rapport remis au gérant
// (maquette validée), avec les détails techniques repliés en bas.
export default async function AuditDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  if (!profile?.is_super_admin) redirect("/join?reason=platform-required");

  const { id } = await params;
  const data = await getAudit(id);
  if (!data) notFound();

  return (
    <>
      <AutoRefresh active={data.audit.status === "en_cours"} />
      <AuditReport audit={data.audit} sections={data.sections} saveAnswers={saveAnswers.bind(null, id)} reanalyse={reanalyseThemes.bind(null, id)} analyseCompetitors={reanalyseCompetitors.bind(null, id)} />
    </>
  );
}
