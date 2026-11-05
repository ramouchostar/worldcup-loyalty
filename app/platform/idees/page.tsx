import { redirect } from "next/navigation";
import { createAdminClient, createServerSupabaseClient } from "@/lib/supabase";
import { todayInBrussels } from "@/lib/broadcast";
import { listPlatformIdeas, type ProposalRow } from "@/lib/agents/proposals";
import { ASSISTANTS, REFUSAL_REASON_LABELS, type IdeaStatus } from "@/lib/agents/types";
import { MarkDoneButton, TeamIdeaForm } from "./TeamIdeaForm";

export const metadata = { title: "Idées — Plateforme" };
export const dynamic = "force-dynamic";

// /platform/idees (ADR 0089 §6, Brigade 04) — l'équipe tient la promesse de la
// brigade dès le premier jour : elle dépose chez un établissement une idée
// écrite à la main (même carte que celles des assistants), puis note « Fait »
// quand le travail promis sur un « Oui » est fait. Les « Oui » en échec des
// assistants arrivent aussi ici : jamais un « Oui » perdu en silence.

const card = "rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 sm:p-5";
const h2 = "text-lg font-bold text-gray-900 dark:text-gray-100";
const muted = "text-sm text-gray-600 dark:text-gray-400";

const STATUS_TEXT: Record<IdeaStatus, string> = {
  proposee: "Attend le gérant",
  acceptee: "Oui · à faire par l'équipe",
  executee: "Fait",
  refusee: "Non",
  expiree: "Expirée sans réponse",
  ecartee: "Pas montrée",
};

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("fr-BE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" }) : "";

export default async function PlatformIdeesPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("is_super_admin").eq("id", user.id).single();
  if (!(profile as { is_super_admin: boolean } | null)?.is_super_admin) redirect("/");

  const [{ data: restos }, { data: subs }, rows] = await Promise.all([
    admin.from("restaurants").select("id, name, is_demo, status").eq("status", "active").order("name"),
    admin.from("restaurant_subscriptions").select("restaurant_id, plan, status"),
    listPlatformIdeas(14),
  ]);
  const planOf = new Map(
    ((subs ?? []) as { restaurant_id: string; plan: string; status: string }[]).filter((s) => s.status === "active").map((s) => [s.restaurant_id, s.plan])
  );
  const restaurants = ((restos ?? []) as { id: string; name: string; is_demo: boolean | null }[]).map((r) => ({
    id: r.id,
    name: r.name,
    plan: planOf.get(r.id) ?? "gratuit",
    demo: !!r.is_demo,
  }));
  const nameOf = new Map(restaurants.map((r) => [r.id, r.name]));
  const today = todayInBrussels();

  const unavailable = !Array.isArray(rows);
  const all: ProposalRow[] = Array.isArray(rows) ? rows : [];
  const toDo = all.filter((r) => r.status === "acceptee");
  const deposited = all.filter((r) => r.origin === "equipe");

  return (
    <div className="space-y-6 max-w-4xl">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Idées</h1>
        <p className={muted}>
          Préparer une idée à la main pour un établissement : le gérant la voit dans ses Idées du jour, avec la même carte que
          celles des assistants. Mêmes règles : forfait, 3 idées par jour, pas de doublon, refus appris.
        </p>
      </header>

      {unavailable && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-900 dark:text-amber-200">
          La table des idées est indisponible : vérifier la migration <code>agent_proposals</code>.
        </p>
      )}

      <section className={`${card} space-y-3`} aria-labelledby="a-faire">
        <h2 id="a-faire" className={h2}>À faire par l&apos;équipe ({toDo.length})</h2>
        {toDo.length === 0 ? (
          <p className={muted}>Rien en attente : aucun « Oui » ne nous attend.</p>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-800">
            {toDo.map((r) => {
              const action = r.content.action;
              return (
                <li key={r.id} className="py-3 space-y-2">
                  <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className="font-semibold text-gray-900 dark:text-gray-100">{nameOf.get(r.restaurant_id) ?? r.restaurant_id}</span>
                    <span className="text-gray-500">· {ASSISTANTS[r.assistant].name} · oui le {when(r.decided_at)}</span>
                  </div>
                  <p className="text-sm text-gray-800 dark:text-gray-200">{r.content.title}</p>
                  {r.execution_error ? (
                    <p className="text-sm text-red-700 dark:text-red-400">Échec : {r.execution_error}</p>
                  ) : action.kind === "team" ? (
                    <p className={muted}>À faire : {action.note}</p>
                  ) : action.kind === "update_fiche" ? (
                    <p className={muted}>Fiche Google à modifier ({action.finding}) — {action.needsInput}</p>
                  ) : action.kind === "relay" ? (
                    <p className={muted}>Relais vers {ASSISTANTS[action.to].name}, pas encore automatisé.</p>
                  ) : (
                    <p className={muted}>En cours d&apos;exécution.</p>
                  )}
                  <MarkDoneButton restaurantId={r.restaurant_id} id={r.id} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={`${card} space-y-4`} aria-labelledby="deposer">
        <h2 id="deposer" className={h2}>Déposer une idée</h2>
        <TeamIdeaForm restaurants={restaurants} today={today} defaultDecideBy={addDays(today, 3)} />
      </section>

      <section className={`${card} space-y-3`} aria-labelledby="deposees">
        <h2 id="deposees" className={h2}>Déposées ces 14 jours ({deposited.length})</h2>
        {deposited.length === 0 ? (
          <p className={muted}>Aucune idée déposée à la main pour l&apos;instant.</p>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-800 text-sm">
            {deposited.map((r) => (
              <li key={r.id} className="py-2.5 flex flex-wrap justify-between gap-x-3 gap-y-1">
                <span className="text-gray-800 dark:text-gray-200">
                  <span className="font-semibold">{nameOf.get(r.restaurant_id) ?? r.restaurant_id}</span> · {ASSISTANTS[r.assistant].name} · {r.content.title}
                </span>
                <span className="text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  {STATUS_TEXT[r.status]}
                  {r.status === "refusee" && r.refusal_reason ? ` · ${REFUSAL_REASON_LABELS[r.refusal_reason].toLowerCase()}` : ""}
                  {r.refusal_note ? ` · « ${r.refusal_note} »` : ""}
                  {r.status === "ecartee" && r.discard_reason ? ` · ${r.discard_reason.replace(/_/g, " ")}` : ""}
                  {r.seen_at && r.status === "proposee" ? " · vue" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
