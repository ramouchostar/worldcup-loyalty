import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { loadTemplate } from "@/lib/missions";
import { listOpenDisputes } from "@/lib/missions-superadmin";
import { METIER_LABELS } from "@/lib/mission-view";
import type { Metier } from "@/lib/mission-money";
import { optionsAreLocked } from "@/lib/mission-template-edit";
import { SubNav } from "../SubNav";
import { QuestionnaireForm, type QuestionView } from "./QuestionnaireForm";

export const metadata = { title: "Questionnaires — Prestataires — Plateforme" };
export const dynamic = "force-dynamic";

const CARD = "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl";
const METIERS: readonly Metier[] = ["video", "photo", "design", "impression"];
const KIND: Record<string, string> = { choice: "un choix", multi: "plusieurs choix", text: "texte libre", number: "nombre", date: "date", contact: "contact", list: "liste", flag: "case à cocher", files: "pièces jointes" };

// ADR 0084 §5 duodecies — les questions posées au restaurateur. On règle les mots (libellé, aide, options) ; la structure (quelles
// questions, obligatoires ou non, dans quel ordre) et les options que le code lit en dur ne se règlent pas ici.
export default async function QuestionnairesPage({ searchParams }: { searchParams: Promise<{ metier?: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  if (!profile?.is_super_admin) redirect("/join?reason=platform-required");

  const sp = await searchParams;
  const metier = (METIERS as readonly string[]).includes(sp.metier ?? "") ? (sp.metier as Metier) : "video";
  const [loaded, disputes] = await Promise.all([loadTemplate(metier), listOpenDisputes()]);
  const questions: QuestionView[] = (loaded?.template.questions ?? []).map((q) => ({
    key: q.key,
    kind: KIND[q.kind] ?? q.kind,
    required: q.required,
    phase: q.phase === "tournage" ? "préparation du tournage" : "brief",
    label: q.label,
    hint: q.hint ?? "",
    options: q.options ? [...q.options] : null,
    locked: optionsAreLocked(q),
  }));

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">Questionnaires</h1>
        <SubNav active="questionnaires" disputes={disputes.length} />
      </div>
      <nav aria-label="Métier" className="flex flex-wrap gap-1.5 text-xs">
        {METIERS.map((m) => (
          <Link key={m} href={`/platform/prestataires/questionnaires?metier=${m}`} className={`rounded-full border px-2.5 py-1 ${m === metier ? "bg-gray-900 text-white" : "border-gray-300"}`}>
            {METIER_LABELS[m]}
          </Link>
        ))}
      </nav>
      <section className={`${CARD} p-5 space-y-3`}>
        <p className="text-xs text-gray-500">
          Chaque enregistrement crée une nouvelle version ; l&apos;ancienne est gardée. Une fois enregistré ici, le questionnaire vit en base : les changements ultérieurs du code ne s&apos;y appliquent plus. Les briefs déjà envoyés gardent leurs réponses.
        </p>
        {loaded ? <QuestionnaireForm key={metier} metier={metier} questions={questions} /> : <p className="text-sm text-gray-500">Ce métier n&apos;a pas encore de questionnaire.</p>}
      </section>
    </div>
  );
}
