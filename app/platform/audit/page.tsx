import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { listAudits, type AuditRow } from "@/lib/audit/store";
import { isConfigured } from "@/lib/audit/dataforseo";
import { listLeads, type LeadRow } from "@/lib/audit/leads";
import { isPlacesConfigured } from "@/lib/audit/places";
import { startAudit } from "./actions";

export const metadata = { title: "Audit — Plateforme" };
export const dynamic = "force-dynamic";
// La mesure (fiche + avis DataForSEO) tourne en tâche de fond après la
// redirection : elle hérite de la durée maximale de cette route.
export const maxDuration = 300;

// ADR 0069 — l'onglet Audit : lancer un audit, retrouver tous les audits déjà faits.
export default async function PlatformAuditPage({ searchParams }: { searchParams: Promise<{ erreur?: string; motif?: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  if (!profile?.is_super_admin) redirect("/join?reason=platform-required");

  const { erreur, motif } = await searchParams;
  const [listing, leads] = await Promise.all([listAudits(), listLeads()]);
  const auditStatus = new Map(listing.missing ? [] : listing.rows.map((a) => [a.id, a.status] as const));

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

      <form action={startAudit} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-4 space-y-3">
        <label className="block text-sm">
          <span className="block text-xs font-semibold text-gray-500 mb-1">Lien Google Maps</span>
          <input
            name="lien"
            type="url"
            placeholder="https://maps.app.goo.gl/… ou https://share.google/…"
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent px-3 py-2"
          />
        </label>
        <p className="text-xs text-gray-500">Ou, sans lien, le nom et la commune :</p>
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] items-end">
          <label className="text-sm">
            <span className="block text-xs font-semibold text-gray-500 mb-1">Établissement</span>
            <input name="name" placeholder="Krusty Smash Burgers" className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="block text-xs font-semibold text-gray-500 mb-1">Commune</span>
            <input name="commune" placeholder="Ixelles" className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent px-3 py-2" />
          </label>
          <button type="submit" className="rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-semibold text-sm px-4 py-2.5">
            Lancer l&apos;audit
          </button>
        </div>
        {erreur === "nom" && <p className="text-xs text-gray-600">Colle un lien Google Maps ou indique le nom de l&apos;établissement.</p>}
        {erreur === "lien" && <p className="text-xs text-gray-600">Lien non reconnu : {motif ?? "aucun établissement lisible"}. Essaie le lien « Partager » de la fiche dans Google Maps.</p>}
      </form>

      <LeadsSection leads={leads} auditStatus={auditStatus} />

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

// ADR 0071 — les demandes venues de /audit-gratuit : chaque analyse est gardée,
// même sans numéro (c'est l'abandon entre la note et la demande de numéro).
function LeadsSection({ leads, auditStatus }: { leads: Awaited<ReturnType<typeof listLeads>>; auditStatus: Map<string, AuditRow["status"]> }) {
  if (leads.missing) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-900">
        <p className="font-semibold">Demandes d&apos;audit gratuit : table absente</p>
        <p className="text-amber-700 text-xs mt-0.5">Appliquer docs/migrations/20260926-1430-audit-gratuit-demandes.sql : la page /audit-gratuit reste indisponible tant qu&apos;elle manque.</p>
      </div>
    );
  }
  const week = leads.rows.filter((l) => Date.now() - new Date(l.created_at).getTime() < 7 * 86_400_000);
  const phones = week.filter((l) => l.phone).length;
  const toReview = leads.rows.filter((l) => l.audit_id && ["mesure", "revise"].includes(auditStatus.get(l.audit_id) ?? "")).length;
  const cost = week.reduce((a, l) => a + Number(l.cost_usd), 0);
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Demandes d&apos;audit gratuit</h2>
        <p className="text-xs text-gray-500">
          7 jours : {week.length} analyse{week.length > 1 ? "s" : ""} · {phones} numéro{phones > 1 ? "s" : ""}
          {week.length ? ` (${Math.round((phones / week.length) * 100)} %)` : ""} · {toReview} rapport{toReview > 1 ? "s" : ""} à relire · {cost.toFixed(2)} $
        </p>
      </div>
      {!isPlacesConfigured() && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          GOOGLE_PLACES_API_KEY absente : /audit-gratuit affiche « analyse indisponible ».
        </p>
      )}
      {leads.rows.length === 0 ? (
        <p className="text-sm text-gray-500">Aucune demande pour l&apos;instant.</p>
      ) : (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="px-4 py-2">Établissement</th>
                <th className="px-4 py-2 text-right">Note</th>
                <th className="px-4 py-2">Mobile</th>
                <th className="px-4 py-2">Reçue</th>
                <th className="px-4 py-2">État</th>
              </tr>
            </thead>
            <tbody>
              {leads.rows.slice(0, 50).map((l) => (
                <LeadLine key={l.id} lead={l} auditStatus={l.audit_id ? auditStatus.get(l.audit_id) ?? null : null} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function leadState(l: LeadRow, audit: AuditRow["status"] | null): string {
  if (l.scan_status === "en_cours") return "Analyse en cours";
  if (!l.phone) return l.scan_status === "hors_zone" ? "Hors Bruxelles, sans numéro" : l.scan_status === "echec" ? `Analyse échouée${l.scan_error ? ` : ${l.scan_error}` : ""}` : "Note vue, sans numéro";
  if (l.scan_status === "hors_zone") return "Hors Bruxelles : à recontacter";
  if (l.whatsapp_sent_at) return "Rapport envoyé";
  if (l.whatsapp_error) return `Envoi WhatsApp échoué : ${l.whatsapp_error}`;
  if (!l.audit_id) return "Numéro laissé, audit non lancé";
  return audit === "en_cours" ? "Audit complet en cours" : audit === "final" ? "Version finale, à envoyer" : audit === "echec" ? "Audit complet échoué" : "Rapport à relire";
}

function LeadLine({ lead, auditStatus }: { lead: LeadRow; auditStatus: AuditRow["status"] | null }) {
  return (
    <tr className="border-t border-gray-100 dark:border-gray-800">
      <td className="px-4 py-2.5">
        {lead.audit_id ? (
          <Link href={`/platform/audit/${lead.audit_id}`} className="font-semibold text-gray-900 dark:text-white hover:underline">{lead.name}</Link>
        ) : (
          <span className="font-semibold text-gray-900 dark:text-white">{lead.name}</span>
        )}
        {lead.address && <span className="block text-xs text-gray-500">{lead.address}</span>}
      </td>
      <td className="px-4 py-2.5 text-right tabular-nums">{lead.score ?? "—"}</td>
      <td className="px-4 py-2.5 tabular-nums text-gray-700 dark:text-gray-300">{lead.phone ?? "—"}</td>
      <td className="px-4 py-2.5 text-gray-600 tabular-nums">{new Date(lead.created_at).toLocaleString("fr-BE", { dateStyle: "short", timeStyle: "short" })}</td>
      <td className="px-4 py-2.5 text-gray-600">{leadState(lead, auditStatus)}</td>
    </tr>
  );
}
