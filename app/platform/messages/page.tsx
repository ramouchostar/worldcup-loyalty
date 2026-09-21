import { redirect } from "next/navigation";
import { CheckCircle2, CircleAlert, CircleDashed } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getEmailSetup } from "@/lib/email";
import { getMessagesOverview, type MessagesOverview } from "@/lib/messages-overview";
import { MESSAGES, SEQUENCES, messageLabel, rate, emptyTotals, type SendTotals } from "@/lib/message-catalog";
import { defaultImage, previewEntries } from "@/lib/email-templates/fixtures";
import { NO_PUSH_DEVICE } from "@/lib/notifications";
import { previewMemberSequences, type SequencePreview } from "@/lib/sequence-runner";
import { MEMBER_SEQUENCE_KEYS } from "@/lib/sequence-rules";
import { SequenceSwitch } from "./SequenceSwitch";
import { TestEmailForm } from "./TestEmailForm";

export const metadata = { title: "Messages — Plateforme" };
export const dynamic = "force-dynamic";

// ADR 0063 — la console des messages du programme : est-ce que l'envoi marche
// (configuration, dernier envoi, dernier échec), qu'est-ce qui part, et quelles
// séquences sont allumées où. Réservé au super-admin (la plateforme est seule
// responsable de traitement, ADR 0025).

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-BE", {
    timeZone: "Europe/Brussels",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function pct(n: number | null): string {
  return n === null ? "—" : `${n} %`;
}

const CHANNEL_LABELS: Record<string, string> = { email: "E-mail", push: "Push", whatsapp: "WhatsApp", in_app: "In-app", none: "—" };

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  sent: { label: "Parti", cls: "bg-gray-100 text-gray-700" },
  delivered: { label: "Délivré", cls: "bg-green-100 text-green-800" },
  bounced: { label: "Rebond", cls: "bg-amber-100 text-amber-800" },
  complained: { label: "Plainte", cls: "bg-amber-100 text-amber-800" },
  failed: { label: "Pas parti", cls: "bg-red-100 text-red-800" },
  holdout: { label: "Témoin", cls: "bg-gray-100 text-gray-500" },
};

function SetupRow({ ok, label, value, hint }: { ok: boolean | null; label: string; value: string; hint?: string }) {
  const Icon = ok === null ? CircleDashed : ok ? CheckCircle2 : CircleAlert;
  const tone = ok === null ? "text-gray-400" : ok ? "text-green-600" : "text-amber-600";
  return (
    <div className="flex items-start gap-3 py-2.5 border-t border-gray-100 first:border-t-0">
      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${tone}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="text-sm font-medium text-gray-900">{label}</span>
          <span className="text-sm text-gray-700 font-mono break-all">{value}</span>
        </div>
        {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
      </div>
    </div>
  );
}

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{value}</p>
      {note && <p className="text-xs text-gray-500 mt-1">{note}</p>}
    </div>
  );
}

function sectionTitle(title: string, sub?: string) {
  return (
    <div className="mb-3">
      <h2 className="text-lg font-bold text-gray-900">{title}</h2>
      {sub && <p className="text-sm text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function totalsFor(o: MessagesOverview, key: string): SendTotals {
  return o.byKey[key] ?? emptyTotals();
}

export default async function PlatformMessagesPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  if (!profile?.is_super_admin) redirect("/join?reason=platform-required");

  const setup = getEmailSetup();
  const o = await getMessagesOverview();
  // Qui recevrait chaque séquence membre aujourd'hui, si elle était allumée —
  // pour décider d'allumer en connaissant le volume. Rien n'est envoyé.
  let preview: SequencePreview = {};
  try {
    preview = await previewMemberSequences(o.restaurants.map((r) => r.id));
  } catch (err) {
    console.error("[platform/messages] aperçu des séquences indisponible:", err);
  }
  const memberKeys = new Set<string>(MEMBER_SEQUENCE_KEYS);
  const enabled = new Set(o.settings.filter((s) => s.enabled).map((s) => `${s.message_key}|${s.restaurant_id}`));
  const testOptions = previewEntries({ logoUrl: null, image: defaultImage }).map((e) => ({
    id: e.id,
    label: `${e.audience === "membre" ? "Membre" : "Restaurateur"} · ${e.sequence}${e.variant ? ` (${e.variant})` : ""}`,
  }));
  const transactional = MESSAGES.filter((m) => m.kind === "transactionnel" && m.key !== "test");
  const emailSendable = setup.hasApiKey && !!setup.domain;

  return (
    <div className="max-w-6xl mx-auto space-y-8 py-8 px-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
        <p className="text-gray-500 text-sm mt-1">
          E-mails, notifications et séquences du programme (ADR 0063) — {o.windowDays} derniers jours.
        </p>
      </div>

      {!o.journalAvailable && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-900">
          <p className="font-semibold">Journal des messages pas encore en base</p>
          <p className="text-amber-800 text-xs mt-0.5">
            Appliquer <span className="font-mono">docs/migrations/20260921-1615-journal-des-messages.sql</span> dans
            l&apos;éditeur SQL Supabase. D&apos;ici là, les e-mails partent sans trace et les séquences restent éteintes.
          </p>
        </div>
      )}

      {/* ── Est-ce que l'envoi marche ? ──────────────────────────────────── */}
      <section className="bg-white border border-gray-200 rounded-2xl p-5">
        {sectionTitle(
          "Envoi des e-mails",
          emailSendable ? "La configuration est complète. Le test ci-dessous le prouve dans ta boîte." : "Tant qu'une ligne est orange, les e-mails ne partent pas ou partent mal."
        )}
        <div>
          <SetupRow
            ok={setup.hasApiKey}
            label="Clé Resend"
            value={setup.hasApiKey ? "Configurée" : "Absente"}
            hint={setup.hasApiKey ? undefined : "Vercel → projet worldcup-loyalty → RESEND_API_KEY (Production), puis redéployer. Sans elle, aucun e-mail ne part."}
          />
          <SetupRow
            ok={!!setup.domain}
            label="Domaine d'envoi"
            value={setup.domain ?? "Non défini"}
            hint={setup.domain ? "Doit être exactement le domaine vérifié chez Resend." : "EMAIL_DOMAIN vide : l'expéditeur de secours de Resend ne délivre qu'au propriétaire du compte. Valeur attendue : boosteats.tech."}
          />
          <SetupRow ok={!!setup.domain} label="Expéditeur membre" value={setup.memberFrom} />
          <SetupRow ok={!!setup.domain} label="Expéditeur restaurateur" value={setup.restaurantFrom} />
          <SetupRow
            ok={!!setup.replyTo}
            label="Les réponses arrivent sur"
            value={setup.replyTo ?? "Non défini"}
            hint={setup.replyTo ? undefined : "EMAIL_REPLY_TO : une boîte lue par l'équipe (contact@boosteats.tech), jamais celle d'un restaurant."}
          />
          <SetupRow
            ok={setup.hasWebhookSecret ? true : null}
            label="Suivi de délivrance"
            value={setup.hasWebhookSecret ? "Webhook signé" : "Pas encore"}
            hint={setup.hasWebhookSecret ? undefined : `Resend → Webhooks → ${setup.appUrl}/api/webhooks/resend (délivré, rebond, plainte), puis RESEND_WEBHOOK_SECRET dans Vercel. Facultatif : sans lui, on sait ce qui part, pas ce qui arrive.`}
          />
          <SetupRow
            ok={o.lastSentAt ? true : o.journalAvailable ? false : null}
            label="Dernier e-mail parti"
            value={o.lastSentAt ? fmtDate(o.lastSentAt) : "Jamais"}
          />
          {o.lastFailure && (
            <SetupRow
              ok={false}
              label="Dernier échec"
              value={`${fmtDate(o.lastFailure.at)} · ${messageLabel(o.lastFailure.key)}`}
              hint={o.lastFailure.error}
            />
          )}
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-sm font-medium text-gray-900 mb-2">M&apos;envoyer un e-mail de test</p>
          <TestEmailForm options={testOptions} to={user.email ?? null} />
          <p className="text-xs text-gray-500 mt-2">Gabarit réel, rendu sur l&apos;établissement fictif des maquettes ; objet préfixé « [Test] ».</p>
        </div>
      </section>

      {/* ── Ce qui part ───────────────────────────────────────────────────── */}
      <section>
        {sectionTitle("Sur 30 jours", "E-mails du journal (tests exclus). Délivrés et rebonds dépendent du webhook Resend ; les clics sont comptés chez nous, sans pixel.")}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Kpi label="E-mails partis" value={String(o.email.sent)} note={o.email.failed ? `${o.email.failed} pas partis` : "aucun échec"} />
          <Kpi label="Délivrés" value={pct(rate(o.email.delivered, o.email.sent))} note={setup.hasWebhookSecret ? undefined : "webhook à brancher"} />
          <Kpi label="Rebonds · plaintes" value={`${o.email.bounced} · ${o.email.complained}`} />
          <Kpi label="Cliqués" value={pct(rate(o.email.clicked, o.email.sent))} note={`${o.email.clicked} e-mail${o.email.clicked > 1 ? "s" : ""}`} />
          <Kpi label="Pushs non joignables" value={String(o.unreachable)} note="membre sans appareil abonné" />
        </div>
        {o.failureReasons.length > 0 && (
          <div className="mt-3 bg-white border border-gray-200 rounded-2xl p-4">
            <p className="text-sm font-medium text-gray-900 mb-2">Pourquoi ça n&apos;est pas parti</p>
            <ul className="space-y-1">
              {o.failureReasons.map((f) => (
                <li key={f.error} className="text-sm text-gray-700 flex gap-3">
                  <span className="tabular-nums font-semibold w-8 text-right shrink-0">{f.count}</span>
                  <span className="break-words">{f.error}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ── Séquences ─────────────────────────────────────────────────────── */}
      <section>
        {sectionTitle(
          "Séquences",
          "Éteintes par défaut, allumées par établissement (ADR 0063 §2). Passage chaque jour à 18 h (Bruxelles) pour les séquences membres ; « aujourd'hui » = qui la recevrait si elle était allumée seule, témoin compris. Les séquences restaurateur arrivent avec la PR suivante."
        )}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-100">
                <th className="px-4 py-3 font-semibold">Séquence</th>
                <th className="px-4 py-3 font-semibold">Réussite</th>
                {o.restaurants.map((r) => (
                  <th key={r.id} className="px-4 py-3 font-semibold whitespace-nowrap">{r.name}</th>
                ))}
                <th className="px-4 py-3 font-semibold text-right">Envoyés · témoin · arrêts</th>
              </tr>
            </thead>
            <tbody>
              {SEQUENCES.map((s) => (
                <tr key={s.key} className="border-b border-gray-50 last:border-0 align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{s.label}</p>
                    <p className="text-xs text-gray-500">{s.audience === "member" ? "Membres" : "Restaurateurs"} · {s.when}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{s.success}</td>
                  {o.restaurants.map((r) => {
                    const today = memberKeys.has(s.key) ? preview[r.id]?.[s.key] : undefined;
                    return (
                      <td key={r.id} className="px-4 py-3">
                        <SequenceSwitch
                          messageKey={s.key}
                          restaurantId={r.id}
                          restaurantName={r.name}
                          sequenceLabel={s.label}
                          enabled={enabled.has(`${s.key}|${r.id}`)}
                          disabled={!o.settingsAvailable}
                        />
                        {today && (
                          <p className="text-[11px] text-gray-500 mt-1 tabular-nums">
                            {today.send} aujourd&apos;hui{today.holdout ? ` · ${today.holdout} témoin` : ""}
                          </p>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-right tabular-nums text-gray-900 whitespace-nowrap">
                    {totalsFor(o, s.key).sent} · {totalsFor(o, s.key).holdout} · {o.optOuts[s.key] ?? 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Transactionnels ───────────────────────────────────────────────── */}
      <section>
        {sectionTitle("E-mails et pushs transactionnels", "Toujours actifs : ils répondent à un fait (compte créé, cadeau qui expire, ticket validé…).")}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-100">
                <th className="px-4 py-3 font-semibold">Message</th>
                <th className="px-4 py-3 font-semibold">Canal</th>
                <th className="px-4 py-3 font-semibold text-right">Partis</th>
                <th className="px-4 py-3 font-semibold text-right">Pas partis</th>
                <th className="px-4 py-3 font-semibold text-right">Délivrés</th>
                <th className="px-4 py-3 font-semibold text-right">Cliqués</th>
              </tr>
            </thead>
            <tbody>
              {transactional.map((m) => {
                const t = totalsFor(o, m.key);
                return (
                  <tr key={m.key} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-gray-900">{m.label}</p>
                      <p className="text-xs text-gray-500">{m.audience === "member" ? "Membre" : "Restaurateur"} · {m.when}</p>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{m.channels}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-900">{t.sent}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${t.failed ? "text-amber-700 font-semibold" : "text-gray-400"}`}>{t.failed}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{pct(rate(t.delivered, t.sent))}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{pct(rate(t.clicked, t.sent))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Notifications ─────────────────────────────────────────────────── */}
      <section>
        {sectionTitle(
          "Notifications — réseau réel",
          "Journal historique des notifications (comptes démo exclus). « In-app » = un bandeau vu seulement si le membre ouvre l'app dans les 24 h : la carte durable arrive avec la PR 4."
        )}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-100">
                <th className="px-4 py-3 font-semibold">Message</th>
                <th className="px-4 py-3 font-semibold text-right">Push</th>
                <th className="px-4 py-3 font-semibold text-right">WhatsApp</th>
                <th className="px-4 py-3 font-semibold text-right">In-app seulement</th>
              </tr>
            </thead>
            <tbody>
              {o.notifications.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-4 text-gray-500">Aucune notification sur la période.</td></tr>
              )}
              {o.notifications.map((n) => (
                <tr key={n.key} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{messageLabel(n.key)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{n.push}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{n.whatsapp}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums ${n.in_app > n.push + n.whatsapp ? "text-amber-700 font-semibold" : ""}`}>{n.in_app}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Journal ───────────────────────────────────────────────────────── */}
      <section>
        {sectionTitle("Journal", "Les 40 derniers envois, tous canaux et tous établissements. Aucune adresse n'est conservée.")}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-100">
                <th className="px-4 py-3 font-semibold">Quand</th>
                <th className="px-4 py-3 font-semibold">Établissement</th>
                <th className="px-4 py-3 font-semibold">Message</th>
                <th className="px-4 py-3 font-semibold">Canal</th>
                <th className="px-4 py-3 font-semibold">Statut</th>
              </tr>
            </thead>
            <tbody>
              {o.recent.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-4 text-gray-500">{o.journalAvailable ? "Rien encore." : "Journal indisponible."}</td></tr>
              )}
              {o.recent.map((r) => {
                const unreachable = r.channel === "none" && r.error === NO_PUSH_DEVICE;
                const st = unreachable ? { label: "Non joignable", cls: "bg-gray-100 text-gray-600" } : STATUS_STYLES[r.status] ?? { label: r.status, cls: "bg-gray-100 text-gray-700" };
                return (
                  <tr key={r.id} className="border-b border-gray-50 last:border-0 align-top">
                    <td className="px-4 py-2.5 whitespace-nowrap tabular-nums text-gray-700">{fmtDate(r.created_at)}</td>
                    <td className="px-4 py-2.5 text-gray-700">{r.restaurant ?? "—"}</td>
                    <td className="px-4 py-2.5 text-gray-900">{messageLabel(r.message_key)}</td>
                    <td className="px-4 py-2.5 text-gray-600">{CHANNEL_LABELS[r.channel] ?? r.channel}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${st.cls}`}>{st.label}</span>
                      {r.clicked && <span className="ml-1.5 inline-block rounded-full px-2 py-0.5 text-xs font-semibold bg-green-50 text-green-700">Cliqué</span>}
                      {r.status === "failed" && !unreachable && r.error && <p className="text-xs text-gray-500 mt-1 break-words">{r.error}</p>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {o.truncated && <p className="text-xs text-gray-500 mt-2">Chiffres tronqués à 20 000 lignes sur la période.</p>}
      </section>
    </div>
  );
}
