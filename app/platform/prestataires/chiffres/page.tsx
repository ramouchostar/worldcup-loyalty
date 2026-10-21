import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { loadStats } from "@/lib/missions-stats";
import { listOpenDisputes } from "@/lib/missions-superadmin";
import { METIER_LABELS } from "@/lib/mission-view";
import { formatEuros } from "@/lib/mission-money";
import { percent, type StatsBlock } from "@/lib/mission-stats";
import type { Metier } from "@/lib/mission-money";
import { SubNav } from "../SubNav";

export const metadata = { title: "Chiffres — Prestataires — Plateforme" };
export const dynamic = "force-dynamic";

const CARD = "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl";
const WHO: Record<string, string> = { restaurant: "le restaurateur", provider: "le prestataire", platform: "la plateforme", system: "le système", inconnu: "non renseigné" };

// ADR 0084 §5 undecies — le module vaut-il le coup ? Entonnoir (briefs → devis → acceptés → livrés → validés), argent, annulations, litiges.
export default async function StatsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  if (!profile?.is_super_admin) redirect("/join?reason=platform-required");

  const [loaded, disputes] = await Promise.all([loadStats(), listOpenDisputes()]);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">Chiffres</h1>
        <SubNav active="chiffres" disputes={disputes.length} />
      </div>
      {!loaded.ok ? (
        <p className={`${CARD} p-5 text-sm text-gray-500`}>Les chiffres ne sont pas encore disponibles : applique les migrations du module Prestataires.</p>
      ) : (
        <>
          {loaded.truncated && <p className="text-xs text-amber-700">Seules les 2 000 missions les plus récentes sont comptées.</p>}
          <Block title="Tous métiers" b={loaded.stats.all} />
          {Object.entries(loaded.stats.byMetier).map(([metier, b]) => (b.sent > 0 ? <Block key={metier} title={METIER_LABELS[metier as Metier]} b={b} /> : null))}
          <p className="text-xs text-gray-500">
            Le volume est la somme des prix des devis des missions validées ou versées ; la commission est ce que Boosteats garde (prix du devis moins la part du prestataire). Un litige compte une mission qui y est, ou qui y est passée.
          </p>
        </>
      )}
    </div>
  );
}

function Block({ title, b }: { title: string; b: StatsBlock }) {
  return (
    <section className={`${CARD} p-5 space-y-4`}>
      <h2 className="font-semibold">{title}</h2>
      {b.sent === 0 ? (
        <p className="text-sm text-gray-500">Aucun brief envoyé pour l&apos;instant.</p>
      ) : (
        <>
          <ol className="space-y-1.5">
            {b.funnel.map((f) => (
              <li key={f.key} className="text-sm">
                <div className="flex justify-between gap-3">
                  <span>{f.label}</span>
                  <span className="tabular-nums">
                    <strong>{f.count}</strong> <span className="text-gray-500">· {percent(f.share)}</span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 mt-1" aria-hidden>
                  <div className="h-1.5 rounded-full bg-gray-900 dark:bg-white" style={{ width: `${Math.round((f.share ?? 0) * 100)}%` }} />
                </div>
              </li>
            ))}
          </ol>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Fact label="Volume (validé)" value={formatEuros(b.volumeCents)} />
            <Fact label="Part des prestataires" value={formatEuros(b.providerCents)} />
            <Fact label="Commission Boosteats" value={formatEuros(b.commissionCents)} />
            <Fact label="Missions terminées" value={String(b.completed)} />
            <Fact label="Annulées" value={String(b.cancelled)} />
            <Fact label="Litiges" value={String(b.disputes)} />
          </dl>
          {b.cancelled > 0 && (
            <p className="text-xs text-gray-500">
              Annulations par : {Object.entries(b.cancelledBy).map(([k, n]) => `${WHO[k] ?? k} ${n}`).join(", ")}.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
