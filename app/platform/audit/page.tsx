import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { listAudits, type AuditRow } from "@/lib/audit/store";
import { isConfigured } from "@/lib/audit/dataforseo";
import { startAudit } from "./actions";

export const metadata = { title: "Audit — Plateforme" };
export const dynamic = "force-dynamic";
// La mesure (fiche + avis DataForSEO) tourne en tâche de fond après la
// redirection : elle hérite de la durée maximale de cette route.
export const maxDuration = 300;

// ADR 0069 — l'onglet Audit : lancer un audit, retrouver tous les audits déjà faits.
export default async function PlatformAuditPage({ searchParams }: { searchParams: Promise<{ erreur?: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  if (!profile?.is_super_admin) redirect("/join?reason=platform-required");

  const { erreur } = await searchParams;
  const listing = await listAudits();

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-8 px-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Audit</h1>
        <p className="text-gray-500 text-sm mt-1">
          Fiche Google et avis d&apos;un restaurant des 19 communes de Bruxelles. Chaque audit est gardé ci-dessous.
        </p>
      </div>

      {!isConfigured() && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-900">
          <p className="font-semibold">DataForSEO non branché</p>
          <p className="text-amber-700 text-xs mt-0.5">DATAFORSEO_LOGIN et DATAFORSEO_PASSWORD manquent : la fiche et les avis passeront en « non branché ».</p>
        </div>
      )}

      <form action={startAudit} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-4 grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] items-end">
        <label className="text-sm">
          <span className="block text-xs font-semibold text-gray-500 mb-1">Établissement</span>
          <input name="name" placeholder="Krusty Smash Burgers" className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent px-3 py-2" />
        </label>
        <label className="text-sm">
          <span className="block text-xs font-semibold text-gray-500 mb-1">Commune</span>
          <input name="commune" placeholder="Ixelles" className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent px-3 py-2" />
        </label>
        <label className="text-sm">
          <span className="block text-xs font-semibold text-gray-500 mb-1">ou CID Google</span>
          <input name="cid" inputMode="numeric" placeholder="facultatif" className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent px-3 py-2" />
        </label>
        <button type="submit" className="rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-semibold text-sm px-4 py-2.5">
          Lancer l&apos;audit
        </button>
        {erreur === "nom" && <p className="text-xs text-gray-600 sm:col-span-4">Indique un nom d&apos;établissement ou un CID.</p>}
      </form>

      {listing.missing ? (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-900">
          <p className="font-semibold">Tables d&apos;audit absentes</p>
          <p className="text-amber-700 text-xs mt-0.5">Appliquer docs/migrations/20260923-2039-audits-restaurant.sql : les audits ne sont pas enregistrés tant qu&apos;elle manque.</p>
        </div>
      ) : listing.rows.length === 0 ? (
        <p className="text-sm text-gray-500">Aucun audit pour l&apos;instant.</p>
      ) : (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="px-4 py-2">Établissement</th>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">État</th>
                <th className="px-4 py-2 text-right">Fiche</th>
                <th className="px-4 py-2 text-right">Avis</th>
                <th className="px-4 py-2 text-right">Coût</th>
              </tr>
            </thead>
            <tbody>
              {listing.rows.map((a) => (
                <AuditLine key={a.id} audit={a} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const STATUS_LABEL: Record<AuditRow["status"], string> = {
  en_cours: "En cours",
  mesure: "Mesuré",
  revise: "Révisé",
  final: "Version finale",
  echec: "Échec",
};

function AuditLine({ audit }: { audit: AuditRow }) {
  const s = audit.scores ?? {};
  return (
    <tr className="border-t border-gray-100 dark:border-gray-800">
      <td className="px-4 py-2.5">
        <Link href={`/platform/audit/${audit.id}`} className="font-semibold text-gray-900 dark:text-white hover:underline">{audit.name}</Link>
        {audit.address && <span className="block text-xs text-gray-500">{audit.address}</span>}
      </td>
      <td className="px-4 py-2.5 text-gray-600 tabular-nums">{new Date(audit.created_at).toLocaleDateString("fr-BE")}</td>
      <td className="px-4 py-2.5 text-gray-600">{STATUS_LABEL[audit.status]}</td>
      <td className="px-4 py-2.5 text-right tabular-nums">{s.fiche ?? "—"}</td>
      <td className="px-4 py-2.5 text-right tabular-nums">{s.avis ?? "—"}</td>
      <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{Number(audit.cost_usd).toFixed(3)} $</td>
    </tr>
  );
}
