import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { loadDisputeFile, listOpenDisputes } from "@/lib/missions-superadmin";
import { loadTemplate } from "@/lib/missions";
import { briefRows, METIER_LABELS, STATUS_VIEW } from "@/lib/mission-view";
import { canOpenDispute, DECISION_LABELS } from "@/lib/mission-dispute";
import { formatDuration, linkHost } from "@/lib/mission-dayof";
import { formatEuros } from "@/lib/mission-money";
import { dateLabelFr } from "@/lib/mission-team-message";
import { SubNav } from "../../SubNav";
import { listMessages } from "@/lib/missions-messages";
import { listProofs } from "@/lib/missions-bat-state";
import { listAllReviews } from "@/lib/missions-reviews";
import { DIRECTION_LABEL } from "@/lib/mission-reviews";
import { batChecklist } from "@/lib/mission-print";
import { batDossier, type DossierProof } from "@/lib/mission-bat-dossier";
import { OpenDisputeForm, ResolveDisputeForm } from "./DisputeControls";

export const metadata = { title: "Dossier — Prestataires — Plateforme" };
export const dynamic = "force-dynamic";

const CARD = "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl";
const when = (iso: string) => new Date(iso).toLocaleString("fr-BE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" });

// ADR 0084 §4 — le dossier d'une mission : tout ce que l'arbitre doit lire AVANT de trancher (le brief verrouillé, le
// devis, les deux versions du compte-rendu, les livraisons, les retouches, la trace), puis les gestes possibles.
export default async function DisputeFilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  if (!profile?.is_super_admin) redirect("/join?reason=platform-required");

  const [loaded, open] = await Promise.all([loadDisputeFile(id), listOpenDisputes()]);
  if (!loaded.ok) {
    return (
      <div className="space-y-6 max-w-3xl">
        <SubNav active="litiges" />
        <p className={`${CARD} p-5 text-sm text-gray-500`}>Le module n&apos;est pas encore disponible : applique les migrations du module Prestataires.</p>
      </div>
    );
  }
  if (!loaded.file) notFound();
  const { mission: m, restaurantName, providerName, providerWarnings, quote, deliveries, retouches, events } = loaded.file;
  const tpl = await loadTemplate(m.metier);
  const thread = await listMessages(m.id, "platform");
  const reviewsRes = await listAllReviews(m.id);
  const proofsRes = m.metier === "impression" ? await listProofs(m.id) : null;
  const bat = proofsRes?.ok
    ? batDossier(
        proofsRes.proofs.map((p): DossierProof => ({ round: p.round, status: p.status, links: p.links, message: p.message, corrections: p.corrections, signedName: p.signed_name, checks: p.checks, sentAt: p.created_at, decidedAt: p.decided_at, signedAt: p.signed_at })),
        batChecklist(m.brief)
      )
    : null;
  const rows = tpl ? briefRows(m.brief ?? {}, tpl.template) : [];
  const v = STATUS_VIEW[m.status];
  const report = m.report as { arrival?: string; end?: string; durationMinutes?: number | null; missing?: string[]; note?: string; overrunMinutes?: number } | null;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="space-y-3">
        <Link href="/platform/prestataires/litiges" className="text-xs text-gray-500 underline underline-offset-2">← Litiges</Link>
        <h1 className="text-2xl font-bold">
          {restaurantName} <span className="text-gray-500 font-normal">· {providerName}</span>
        </h1>
        <p className="text-sm text-gray-500">
          {METIER_LABELS[m.metier]} · {v.label}
          {m.shoot_date ? ` · tournage ${dateLabelFr(m.shoot_date)}${m.shoot_start ? ` à ${m.shoot_start}` : ""}` : ""}
          {providerWarnings > 0 ? ` · ${providerWarnings} avertissement${providerWarnings > 1 ? "s" : ""} déjà pour ce prestataire` : ""}
        </p>
        <SubNav active="litiges" disputes={open.length} />
      </div>

      {/* Les gestes */}
      {canOpenDispute(m.status) && (
        <section className={`${CARD} p-5 space-y-2`}>
          <h2 className="font-semibold">Ouvrir un litige</h2>
          <p className="text-xs text-gray-500">Rien d&apos;automatique ne se passe plus sur cette mission tant qu&apos;elle est en litige : ni rappel, ni validation, ni versement.</p>
          <OpenDisputeForm missionId={m.id} />
        </section>
      )}
      {m.status === "litige" && (
        <section className={`${CARD} p-5 space-y-3`}>
          <h2 className="font-semibold">Trancher</h2>
          {m.dispute && (
            <p className="text-xs text-gray-600 dark:text-gray-300">
              Ouvert {m.dispute_opened_at ? `le ${when(m.dispute_opened_at)}` : ""} · avant : {STATUS_VIEW[m.dispute.previousStatus as keyof typeof STATUS_VIEW]?.label ?? m.dispute.previousStatus} · « {m.dispute.reason} »
            </p>
          )}
          <ResolveDisputeForm missionId={m.id} hasDelivery={deliveries.length > 0} />
        </section>
      )}
      {m.dispute?.decision && (
        <section className={`${CARD} p-5 space-y-1`}>
          <h2 className="font-semibold">Décision</h2>
          <p className="text-sm">
            {DECISION_LABELS[m.dispute.decision].title}
            {m.dispute.decision === "split" ? ` · ${m.dispute.providerPct} % pour le prestataire` : ""}
            {m.dispute.sanction && m.dispute.sanction !== "none" ? ` · sanction : ${m.dispute.sanction}` : ""}
          </p>
          <p className="text-xs text-gray-500 whitespace-pre-line">{m.dispute.note}</p>
          {m.dispute_resolved_at && <p className="text-xs text-gray-500">Le {when(m.dispute_resolved_at)}</p>}
        </section>
      )}

      {/* Le dossier */}
      <section className={`${CARD} p-5 space-y-2`}>
        <h2 className="font-semibold">Le brief (verrouillé{m.brief_locked_at ? ` le ${when(m.brief_locked_at)}` : ""})</h2>
        <dl className="text-sm divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map((r) => (
            <div key={r.label} className="py-1.5 grid grid-cols-3 gap-2">
              <dt className="text-xs text-gray-500">{r.label}</dt>
              <dd className="col-span-2 whitespace-pre-line">{r.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {quote && (
        <section className={`${CARD} p-5 space-y-1`}>
          <h2 className="font-semibold">Le devis</h2>
          <p className="text-sm">
            {formatEuros(quote.price_cents)}
            {quote.hours ? ` · ${String(quote.hours).replace(".", ",")} h` : ""}
            {quote.delivery_days ? ` · livraison en ${quote.delivery_days} jours` : ""}
          </p>
          {quote.included.length > 0 && <p className="text-xs"><strong>Inclus :</strong> {quote.included.join(", ")}</p>}
          {quote.excluded.length > 0 && <p className="text-xs text-gray-500"><strong>Non inclus :</strong> {quote.excluded.join(", ")}</p>}
          {quote.hypotheses && <p className="text-xs text-gray-500 whitespace-pre-line">{quote.hypotheses}</p>}
          <p className="text-xs text-gray-500">Payé {m.paid_cents ? formatEuros(m.paid_cents) : "—"} · prestataire {m.provider_cents ? formatEuros(m.provider_cents) : "—"} · acompte {m.deposit_cents ? formatEuros(m.deposit_cents) : "—"}</p>
        </section>
      )}

      <section className={`${CARD} p-5 space-y-2`}>
        <h2 className="font-semibold">Le compte-rendu : les deux versions</h2>
        {!report ? (
          <p className="text-sm text-gray-500">Pas de compte-rendu.</p>
        ) : (
          <>
            <p className="text-sm">
              <strong>Version du prestataire :</strong> arrivé {report.arrival}, fini {report.end}
              {typeof report.durationMinutes === "number" ? ` (${formatDuration(report.durationMinutes)} sur place)` : ""}
              {report.overrunMinutes && report.overrunMinutes > 30 ? ` · dépasse le devis de ${formatDuration(report.overrunMinutes)}` : ""}
            </p>
            {report.missing && report.missing.length > 0 && <p className="text-xs">Ce qui a manqué : {report.missing.join(" ; ")}</p>}
            {report.note && <p className="text-xs text-gray-600 whitespace-pre-line">{report.note}</p>}
            <p className="text-sm">
              <strong>Version du restaurateur :</strong>{" "}
              {m.report_confirmed_at ? "il a confirmé." : m.report_contested_at ? "il conteste." : "pas encore de réponse."}
            </p>
            {m.report_contest_note && <p className="text-xs text-gray-600 whitespace-pre-line">{m.report_contest_note}</p>}
          </>
        )}
      </section>

      <section className={`${CARD} p-5 space-y-2`}>
        <h2 className="font-semibold">Livraisons et retouches</h2>
        {deliveries.length === 0 && <p className="text-sm text-gray-500">Aucune livraison.</p>}
        {deliveries.map((d) => (
          <div key={d.id} className="text-sm space-y-0.5">
            <p className="font-medium">Version {d.round} · {when(d.created_at)}</p>
            <ul className="text-xs text-gray-600">
              {d.links.map((l) => (
                <li key={l}>
                  <a href={l} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2">{linkHost(l)}</a>
                </li>
              ))}
            </ul>
            {d.message && <p className="text-xs text-gray-500 whitespace-pre-line">{d.message}</p>}
          </div>
        ))}
        {retouches.map((r) => (
          <div key={r.round} className="text-sm space-y-0.5">
            <p className="font-medium">Tour de retours {r.round} · {when(r.created_at)}</p>
            <ol className="list-decimal pl-5 text-xs text-gray-600 space-y-0.5">
              {r.notes.map((n, i) => (
                <li key={i}>
                  <strong>{n.category}{n.at ? ` (${n.at})` : ""}</strong> : {n.text}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </section>

      {proofsRes && (
        <section className={`${CARD} p-5 space-y-3`}>
          <h2 className="font-semibold">Le bon à tirer</h2>
          {!bat ? (
            <p className="text-sm text-gray-500">Les épreuves ne sont pas disponibles : applique la migration du bon à tirer.</p>
          ) : (
            <>
              <p className={`text-sm ${bat.phase === "signed" ? "font-medium" : "text-gray-500"}`}>{bat.summary}</p>
              {bat.proofs.map((p) => (
                <div key={p.round} className="text-sm space-y-1 border-t border-gray-100 dark:border-gray-800 pt-2">
                  <p className="font-medium">Épreuve {p.round} · envoyée {when(p.sentAt)} · {p.statusText}</p>
                  <ul className="text-xs text-gray-600">
                    {p.links.map((l) => (
                      <li key={l}>
                        <a href={l} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2">{linkHost(l)}</a>
                      </li>
                    ))}
                  </ul>
                  {p.message && <p className="text-xs text-gray-500 whitespace-pre-line">{p.message}</p>}
                  {p.corrections && p.corrections.length > 0 && (
                    <ol className="list-decimal pl-5 text-xs text-gray-600 space-y-0.5">
                      {p.corrections.map((c, i) => (
                        <li key={i}><strong>{c.category}</strong> : {c.text}</li>
                      ))}
                    </ol>
                  )}
                  {p.signature && (
                    <div className="text-xs space-y-0.5">
                      <p><strong>Signée par {p.signature.name}</strong> le {when(p.signature.at)}</p>
                      <ul>
                        {p.signature.ticked.map((t) => (
                          <li key={t.label} className={t.done ? "" : "text-red-600"}>{t.done ? "✓" : "✗ non coché :"} {t.label}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </section>
      )}

      {reviewsRes.ok && reviewsRes.reviews.length > 0 && (
        <section className={`${CARD} p-5 space-y-2`}>
          <h2 className="font-semibold">Les avis</h2>
          <ul className="space-y-1.5 text-sm">
            {reviewsRes.reviews.map((r) => (
              <li key={r.id}>
                <span className="text-xs text-gray-500">{DIRECTION_LABEL[r.direction]} · {when(r.createdAt)}{r.hiddenAt ? " · masqué" : ""}</span>
                <p>{r.rating}/5{r.comment ? ` · ${r.comment}` : ""}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={`${CARD} p-5 space-y-2`}>
        <h2 className="font-semibold">Les messages ({thread.length})</h2>
        <p className="text-xs text-gray-500">Le texte tel qu&apos;il a été écrit, y compris les numéros et e-mails que les parties n&apos;ont pas vus.</p>
        {thread.length === 0 ? (
          <p className="text-sm text-gray-500">Aucun message.</p>
        ) : (
          <ol className="space-y-2 text-sm">
            {thread.map((t) => (
              <li key={t.id}>
                <span className="text-xs text-gray-500">
                  {t.sender === "restaurant" ? restaurantName : t.sender === "provider" ? providerName : "Boosteats"} · {when(t.at)}
                  {t.masked ? " · contact masqué pour les parties" : ""}
                </span>
                <p className="whitespace-pre-line">{t.body}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className={`${CARD} p-5 space-y-2`}>
        <h2 className="font-semibold">La trace</h2>
        <ul className="text-xs text-gray-600 dark:text-gray-300 space-y-0.5">
          {events.map((e) => (
            <li key={e.id}>
              <span className="text-gray-400">{when(e.created_at)}</span> · {e.actor_kind} · {e.kind}
              {e.from_status || e.to_status ? ` (${e.from_status ?? "…"} → ${e.to_status ?? "…"})` : ""}
              {e.reason ? ` · ${e.reason}` : ""}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
