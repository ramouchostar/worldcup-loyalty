import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { bpsToPct, getTerms } from "@/lib/marketplace-settings";
import { budgetInputFrom, formatsOf, loadBudgetConfig } from "@/lib/marketplace-budgets";
import { defaultTemplate } from "@/lib/mission-brief";
import { METIER_LABELS } from "@/lib/mission-view";
import type { Metier } from "@/lib/mission-money";
import { listOpenDisputes } from "@/lib/missions-superadmin";
import { SubNav } from "../SubNav";
import { BudgetsForm, SettingsForm } from "./SettingsForm";

export const metadata = { title: "Réglages — Prestataires — Plateforme" };
export const dynamic = "force-dynamic";

const METIERS: readonly { metier: Metier; noun: string }[] = [
  { metier: "video", noun: "vidéo" },
  { metier: "photo", noun: "photo" },
  { metier: "design", noun: "design" },
  { metier: "impression", noun: "impression" },
];

const CARD = "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl";

// ADR 0084 §2 et §3 — ce que la plateforme règle : la commission, l'acompte, les budgets planchers. Les règles de
// l'ADR (deux tours de retours, 7 jours pour prévenir l'équipe, validation automatique à 7 jours, barème d'annulation)
// ne se règlent pas ici : elles sont gravées dans la base et dans les écrans, et se changent par un ADR.
export default async function PlatformSettingsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  if (!profile?.is_super_admin) redirect("/join?reason=platform-required");

  const [{ terms, source }, disputes, ...budgets] = await Promise.all([getTerms(), listOpenDisputes(), ...METIERS.map((m) => loadBudgetConfig(m.metier))]);

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">Réglages</h1>
        <SubNav active="reglages" disputes={disputes.length} />
      </div>

      <section className={`${CARD} p-5 space-y-3`}>
        <h2 className="font-semibold">Commission et acompte</h2>
        {source === "defaut" && <p className="text-xs text-amber-700">Aucun réglage enregistré (ou module non appliqué) : les valeurs de l&apos;ADR 0084 s&apos;appliquent. Enregistre pour les fixer.</p>}
        <SettingsForm initial={{ commissionPct: bpsToPct(terms.commissionBps), proCommissionPct: bpsToPct(terms.proCommissionBps), depositPct: bpsToPct(terms.depositBps) }} />
      </section>

      {METIERS.map(({ metier, noun }, i) => {
        const b = budgets[i];
        const template = defaultTemplate(metier);
        const formats = template ? formatsOf(template) : [];
        return (
          <section key={metier} className={`${CARD} p-5 space-y-3`}>
            <h2 className="font-semibold">Budgets ({METIER_LABELS[metier].toLowerCase()})</h2>
            {!b.ok || !template ? (
              <p className="text-sm text-gray-500">Le module n&apos;est pas encore disponible : applique les migrations du module Prestataires.</p>
            ) : (
              <BudgetsForm metier={metier} noun={noun} formats={formats} initial={budgetInputFrom(b.floorCents, b.ambition, formats)} />
            )}
          </section>
        );
      })}

      <section className={`${CARD} p-5 space-y-2`}>
        <h2 className="font-semibold">Ce qui ne se règle pas ici</h2>
        <ul className="list-disc pl-5 text-xs text-gray-600 dark:text-gray-300 space-y-1">
          <li>Deux tours de retours, chacun en un seul envoi.</li>
          <li>Date de tournage au moins 7 jours après son choix (pour prévenir l&apos;équipe).</li>
          <li>Validation automatique 7 jours après la livraison, après deux rappels.</li>
          <li>Barème d&apos;annulation : gratuit à plus de 7 jours, la moitié entre 7 jours et 48 h, tout en dessous.</li>
        </ul>
        <p className="text-xs text-gray-500">Ce sont les règles de l&apos;ADR 0084 : les changer demande une décision écrite, pas un réglage.</p>
      </section>
    </div>
  );
}
