import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getAudit, type SectionRow } from "@/lib/audit/store";
import type { FicheScore, CriterionStatus } from "@/lib/audit/fiche-score";
import type { ReviewsResultSummary } from "@/lib/audit/measure";
import type { Recommendations } from "@/lib/audit/recommend";
import { AutoRefresh } from "./AutoRefresh";

export const metadata = { title: "Audit — Plateforme" };
export const dynamic = "force-dynamic";

// ADR 0069 — un audit enregistré : état de chaque volet (avec son motif
// d'échec), la grille de la fiche, la lecture des avis, les priorités.
// Version interne (console) ; le rapport client mis en page vient en PR 5.
export default async function AuditDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  if (!profile?.is_super_admin) redirect("/join?reason=platform-required");

  const { id } = await params;
  const data = await getAudit(id);
  if (!data) notFound();
  const { audit, sections } = data;
  const byKey = Object.fromEntries(sections.map((s) => [s.section, s])) as Partial<Record<SectionRow["section"], SectionRow>>;
  const fiche = byKey.fiche?.status === "ok" ? (byKey.fiche.result as FicheScore) : null;
  const avis = byKey.avis?.status === "ok" ? (byKey.avis.result as ReviewsResultSummary) : null;
  const reco = audit.recommendations as Recommendations | null;

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-8 px-4">
      <AutoRefresh active={audit.status === "en_cours"} />
      <div>
        <Link href="/platform/audit" className="text-xs text-gray-500 hover:underline">← Tous les audits</Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{audit.name}</h1>
        <p className="text-gray-500 text-sm mt-1">
          {audit.address ?? "Adresse en cours de lecture"} · lancé le {new Date(audit.created_at).toLocaleString("fr-BE")} ·{" "}
          {audit.status === "en_cours" ? "mesure en cours (1 à 4 minutes)…" : `coût ${Number(audit.cost_usd).toFixed(3)} $`}
        </p>
      </div>

      {fiche?.approximate && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-900">
          <p className="font-semibold">Fiche trouvée avec le libellé raccourci « {fiche.approximate} »</p>
          <p className="text-amber-700 text-xs mt-0.5">
            Vérifie l&apos;adresse ci-dessus : une enseigne à plusieurs adresses peut renvoyer la mauvaise. Pour viser juste, relance avec le lien Google Maps de la fiche.
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        {(["fiche", "avis", "concurrents", "reseaux"] as const).map((k) => (
          <SectionTile key={k} label={SECTION_LABEL[k]} section={byKey[k]} score={(audit.scores as Record<string, number | null>)?.[k] ?? null} />
        ))}
      </div>

      {reco && reco.top.length > 0 && (
        <Card title="Priorités (moteur de scénarios)">
          <ol className="space-y-3 list-decimal pl-5 text-sm">
            {reco.top.map((s) => (
              <li key={s.id}>
                <b className="text-gray-900 dark:text-white">{s.title}</b>
                <p className="text-gray-600 dark:text-gray-400">{s.diagnostic}</p>
                <ul className="list-disc pl-5 text-gray-600 dark:text-gray-400">{s.steps.map((x) => <li key={x}>{x}</li>)}</ul>
              </li>
            ))}
          </ol>
          <p className="text-xs text-gray-500 mt-3">{reco.matched} scénarios correspondent aux signaux mesurés.</p>
        </Card>
      )}

      {fiche && (
        <Card title={`Fiche Google — ${fiche.score ?? "—"}/100 · sur ${fiche.verified} critères vérifiés sur ${fiche.total}`}>
          <ul className="divide-y divide-gray-100 dark:divide-gray-800 text-sm">
            {fiche.criteria.map((c) => (
              <li key={c.key} className="flex justify-between gap-3 py-1.5">
                <span>{c.label}{c.detail && <span className="block text-xs text-gray-500">{c.detail}</span>}</span>
                <span className={`shrink-0 self-center text-[11px] font-bold rounded-full px-2 py-0.5 ${PILL[c.status]}`}>{STATUS_TEXT[c.status]}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {avis && (
        <Card title={`Avis — ${avis.read} lus sur ${avis.total ?? "?"}`}>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Stat label="Réponses (12 mois)" value={avis.responses.share != null ? `${Math.round(avis.responses.share * 100)} %` : "—"} />
            <Stat label="Délai médian" value={avis.responses.medianDelayDays != null ? `${Math.round(avis.responses.medianDelayDays)} j` : "—"} />
            <Stat label="Réponses aux 1–2★" value={avis.responses.negativeShare != null ? `${Math.round(avis.responses.negativeShare * 100)} %` : "—"} />
            <Stat
              label="Bascule"
              value={avis.breakpoint ? `${avis.breakpoint.month} : ${avis.breakpoint.before}★ → ${avis.breakpoint.after}★` : "pas de bascule nette"}
            />
          </dl>
          <div className="overflow-x-auto mt-4">
            <table className="text-xs tabular-nums min-w-[480px]">
              <thead><tr className="text-gray-400"><th className="pr-4 text-left">Mois</th><th className="pr-4 text-right">Avis</th><th className="pr-4 text-right">Moyenne</th><th className="text-right">Glissante 3 mois</th></tr></thead>
              <tbody>
                {avis.monthly.slice(-18).map((m) => (
                  <tr key={m.month}><td className="pr-4">{m.month}</td><td className="pr-4 text-right">{m.count}</td><td className="pr-4 text-right">{m.avg}</td><td className="text-right">{m.rolling3}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

const SECTION_LABEL = { fiche: "Fiche Google", avis: "Avis", concurrents: "Concurrents", reseaux: "Réseaux sociaux" } as const;
const STATUS_TEXT: Record<CriterionStatus, string> = { ok: "OK", partiel: "Partiel", manquant: "Manquant", non_verifie: "Non vérifié" };
const PILL: Record<CriterionStatus, string> = {
  ok: "bg-green-100 text-green-800",
  partiel: "bg-amber-100 text-amber-800",
  manquant: "bg-gray-200 text-gray-800",
  non_verifie: "border border-dashed border-gray-300 text-gray-500",
};
const SECTION_STATE: Record<SectionRow["status"], string> = { en_cours: "En cours", ok: "Terminé", echec: "Échec", non_branche: "Non branché" };

function SectionTile({ label, section, score }: { label: string; section?: SectionRow; score: number | null }) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-3">
      <p className="text-xs font-semibold text-gray-500">{label}</p>
      <p className="text-2xl font-bold tabular-nums text-gray-900 dark:text-white">{score ?? "—"}<span className="text-xs text-gray-400">/100</span></p>
      <p className="text-xs text-gray-500">{section ? SECTION_STATE[section.status] : "En attente"}{section?.source ? ` · ${section.source}` : ""}</p>
      {section?.error && <p className="text-xs text-gray-700 dark:text-gray-300 mt-1">{section.error}</p>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-4">
      <h2 className="font-semibold text-gray-900 dark:text-white mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="font-semibold text-gray-900 dark:text-white">{value}</dd>
    </div>
  );
}
