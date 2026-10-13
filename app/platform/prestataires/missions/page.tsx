import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { listAllMissions, listOpenDisputes } from "@/lib/missions-superadmin";
import { METIER_LABELS, STATUS_VIEW } from "@/lib/mission-view";
import { MISSION_STATUSES } from "@/lib/mission-states";
import { formatEuros } from "@/lib/mission-money";
import { dateLabelFr } from "@/lib/mission-team-message";
import { SubNav } from "../SubNav";

export const metadata = { title: "Missions — Prestataires — Plateforme" };
export const dynamic = "force-dynamic";

const CARD = "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl";
const TONE: Record<string, string> = { neutral: "bg-gray-100 text-gray-800", good: "bg-emerald-100 text-emerald-900", warn: "bg-amber-100 text-amber-900", danger: "bg-red-100 text-red-900" };
const METIERS = ["video", "photo", "design", "impression"] as const;

// ADR 0084 — toutes les missions, tous restaurants : où elles en sont, combien elles pèsent. Lecture seule : les
// gestes (accepter, annuler, trancher, verser) se font depuis la page Prestataires ou le dossier d'un litige.
export default async function PlatformMissionsPage({ searchParams }: { searchParams: Promise<{ statut?: string; metier?: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  if (!profile?.is_super_admin) redirect("/join?reason=platform-required");

  const sp = await searchParams;
  const statut = (MISSION_STATUSES as readonly string[]).includes(sp.statut ?? "") ? sp.statut : undefined;
  const metier = (METIERS as readonly string[]).includes(sp.metier ?? "") ? sp.metier : undefined;
  const [result, disputes] = await Promise.all([listAllMissions({ status: statut, metier }), listOpenDisputes()]);

  const href = (over: { statut?: string; metier?: string }) => {
    const q = new URLSearchParams();
    const st = "statut" in over ? over.statut : statut;
    const me = "metier" in over ? over.metier : metier;
    if (st) q.set("statut", st);
    if (me) q.set("metier", me);
    return `/platform/prestataires/missions${q.size ? `?${q}` : ""}`;
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">Missions</h1>
        <SubNav active="missions" disputes={disputes.length} />
      </div>

      <div className="space-y-2 text-xs">
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-gray-500 mr-1">État</span>
          <Link href={href({ statut: undefined })} className={`rounded-full border px-2.5 py-1 ${!statut ? "bg-gray-900 text-white" : "border-gray-300"}`}>Tous</Link>
          {MISSION_STATUSES.filter((s) => s !== "brief").map((s) => (
            <Link key={s} href={href({ statut: s })} className={`rounded-full border px-2.5 py-1 ${statut === s ? "bg-gray-900 text-white" : "border-gray-300"}`}>{STATUS_VIEW[s].label}</Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-gray-500 mr-1">Métier</span>
          <Link href={href({ metier: undefined })} className={`rounded-full border px-2.5 py-1 ${!metier ? "bg-gray-900 text-white" : "border-gray-300"}`}>Tous</Link>
          {METIERS.map((m) => (
            <Link key={m} href={href({ metier: m })} className={`rounded-full border px-2.5 py-1 ${metier === m ? "bg-gray-900 text-white" : "border-gray-300"}`}>{METIER_LABELS[m]}</Link>
          ))}
        </div>
      </div>

      {!result.ok ? (
        <p className={`${CARD} p-5 text-sm text-gray-500`}>Le module n&apos;est pas encore disponible : applique les migrations du module Prestataires.</p>
      ) : result.missions.length === 0 ? (
        <p className={`${CARD} p-5 text-sm text-gray-500`}>Aucune mission{statut || metier ? " pour ce filtre" : " pour l'instant"}.</p>
      ) : (
        <div className={`${CARD} overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-200 dark:border-gray-800">
                <th className="px-4 py-3 font-medium">Mission</th>
                <th className="px-4 py-3 font-medium">État</th>
                <th className="px-4 py-3 font-medium">Tournage</th>
                <th className="px-4 py-3 font-medium text-right">Payé</th>
                <th className="px-4 py-3 font-medium text-right">Prestataire</th>
                <th className="px-4 py-3 font-medium text-right">Boosteats</th>
                <th className="px-4 py-3 font-medium"><span className="sr-only">Dossier</span></th>
              </tr>
            </thead>
            <tbody>
              {result.missions.map((m) => {
                const v = STATUS_VIEW[m.status];
                return (
                  <tr key={m.id} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                    <td className="px-4 py-3">
                      <Link href={`/admin/${m.restaurant_id}/prestataires/${m.id}`} className="font-semibold underline underline-offset-2">{m.restaurant_name}</Link>
                      <p className="text-xs text-gray-500">{METIER_LABELS[m.metier as keyof typeof METIER_LABELS] ?? m.metier} · {m.provider_name}</p>
                      {m.report_contested_at && !m.report_confirmed_at && <p className="text-xs text-red-700 font-semibold">Compte-rendu contesté</p>}
                    </td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${TONE[v.tone]}`}>{v.label}</span></td>
                    <td className="px-4 py-3 text-xs text-gray-600">{m.shoot_date ? dateLabelFr(m.shoot_date) : "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{m.paid_cents ? formatEuros(m.paid_cents) : "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{m.provider_cents ? formatEuros(m.provider_cents) : "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{m.platform_cents ? formatEuros(m.platform_cents) : "—"}</td>
                    <td className="px-4 py-3 text-xs"><Link href={`/platform/prestataires/litiges/${m.id}`} className="underline underline-offset-2">Dossier</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-gray-500">Montants hors TVA, figés à l&apos;acceptation du devis. Les brouillons de brief n&apos;apparaissent pas : ils appartiennent encore au restaurateur.</p>
    </div>
  );
}
