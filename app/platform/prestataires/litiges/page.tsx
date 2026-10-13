import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { listNeedingAttention, listOpenDisputes } from "@/lib/missions-superadmin";
import { STATUS_VIEW } from "@/lib/mission-view";
import { dateLabelFr } from "@/lib/mission-team-message";
import { SubNav } from "../SubNav";

export const metadata = { title: "Litiges — Prestataires — Plateforme" };
export const dynamic = "force-dynamic";

const CARD = "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl";
const since = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("fr-BE", { day: "numeric", month: "long", timeZone: "Europe/Brussels" }) : "");

// ADR 0084 §4 — la médiation : les litiges ouverts (rien d'automatique n'y passe), et les comptes-rendus contestés
// qui attendent que la plateforme décide d'ouvrir ou non un litige.
export default async function PlatformDisputesPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  if (!profile?.is_super_admin) redirect("/join?reason=platform-required");

  const [open, attention] = await Promise.all([listOpenDisputes(), listNeedingAttention()]);

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">Litiges</h1>
        <SubNav active="litiges" disputes={open.length} />
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold">En médiation</h2>
        {open.length === 0 ? (
          <p className={`${CARD} p-5 text-sm text-gray-500`}>Aucun litige ouvert.</p>
        ) : (
          <ul className="space-y-3">
            {open.map((d) => (
              <li key={d.id} className={`${CARD} p-5 flex items-start justify-between gap-3 flex-wrap`}>
                <div className="min-w-0">
                  <p className="font-semibold">
                    {d.restaurant_name} <span className="text-gray-500 font-normal">· {d.provider_name}</span>
                  </p>
                  <p className="text-xs text-gray-500">Ouvert le {since(d.dispute_opened_at)}{d.shoot_date ? ` · tournage ${dateLabelFr(d.shoot_date)}` : ""}</p>
                  {d.dispute?.reason && <p className="text-xs text-gray-600 mt-1 whitespace-pre-line">« {d.dispute.reason} »</p>}
                </div>
                <Link href={`/platform/prestataires/litiges/${d.id}`} className="rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-semibold text-xs px-3 py-2">
                  Ouvrir le dossier
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Comptes-rendus contestés</h2>
        <p className="text-xs text-gray-500">Le restaurateur conteste ce que le prestataire a écrit. Rien n&apos;est automatique tant que c&apos;est le cas ; ouvre un litige si les deux versions ne se rejoignent pas.</p>
        {attention.length === 0 ? (
          <p className={`${CARD} p-5 text-sm text-gray-500`}>Aucun compte-rendu contesté.</p>
        ) : (
          <ul className="space-y-3">
            {attention.map((m) => (
              <li key={m.id} className={`${CARD} p-5 flex items-start justify-between gap-3 flex-wrap`}>
                <div className="min-w-0">
                  <p className="font-semibold">
                    {m.restaurant_name} <span className="text-gray-500 font-normal">· {m.provider_name}</span>
                  </p>
                  <p className="text-xs text-gray-500">{STATUS_VIEW[m.status].label} · contesté le {since(m.report_contested_at)}</p>
                </div>
                <Link href={`/platform/prestataires/litiges/${m.id}`} className="rounded-lg border border-gray-300 dark:border-gray-700 font-semibold text-xs px-3 py-2 text-gray-700 dark:text-gray-200">
                  Lire le dossier
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
