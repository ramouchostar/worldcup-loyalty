import { redirect } from "next/navigation";
import Link from "next/link";
import { createAdminClient, createServerSupabaseClient } from "@/lib/supabase";
import { todayInBrussels } from "@/lib/qr-funnel";
import { listDailyEntries } from "@/lib/daily-revenue";
import {
  OUTCOMES,
  OUTCOME_LABEL,
  TEST_DAYS,
  addDays,
  dayLabel,
  isDay,
  morningMessage,
  reminderMessage,
  replyMessage,
  testStats,
  weeklyRecap,
  weekdayName,
  type DailyEntry,
  type Outcome,
} from "@/lib/daily-revenue-model";
import { CopyText } from "@/components/platform/CopyText";
import { deleteDay, saveDay } from "./actions";

export const metadata = { title: "CA du jour — Plateforme" };
export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | undefined>>;

const CARD = "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl";
const INPUT = "w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent px-2.5 py-2 text-sm";
const BTN = "rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-semibold text-sm px-4 py-2.5";
const LABEL = "text-xs font-semibold text-gray-600 dark:text-gray-300";
const BUBBLE = "whitespace-pre-wrap rounded-xl rounded-bl-sm bg-emerald-50 dark:bg-emerald-950/40 px-3.5 py-3 text-sm text-gray-900 dark:text-gray-100";

const VERDICT_CLS = {
  neutral: "bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300",
  good: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300",
  warn: "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300",
  bad: "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-800 dark:text-red-300",
} as const;

const DAY_CLS: Record<Outcome | "a_noter" | "futur", string> = {
  repondu: "bg-emerald-50 dark:bg-emerald-950/40 border-transparent text-emerald-800 dark:text-emerald-300",
  spontane: "bg-emerald-50 dark:bg-emerald-950/40 border-transparent text-emerald-800 dark:text-emerald-300",
  relance: "bg-amber-50 dark:bg-amber-950/40 border-transparent text-amber-800 dark:text-amber-300",
  sans_reponse: "bg-red-50 dark:bg-red-950/40 border-transparent text-red-800 dark:text-red-300",
  ferme: "border-gray-200 dark:border-gray-800 text-gray-500",
  historique: "border-gray-200 dark:border-gray-800 text-gray-500",
  a_noter: "border-dashed border-gray-400 dark:border-gray-600 text-gray-600 dark:text-gray-300",
  futur: "border-gray-100 dark:border-gray-900 text-gray-400 opacity-60",
};

const eur = (n: number) => `${Math.round(n).toLocaleString("fr-BE")} €`;

// ADR 0078 — le CA du jour noté à la main pendant le test WhatsApp. Page hors
// du menu de la plateforme : le lien est gardé par le super-admin qui mène le
// test. Chaque jour noté part aussi dans restaurant_sales (prévision, ADR 0027).
export default async function PlatformDailyRevenuePage({ searchParams }: { searchParams: Search }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  if (!profile?.is_super_admin) redirect("/join?reason=platform-required");

  const sp = await searchParams;
  const { data: restaurants } = await createAdminClient()
    .from("restaurants")
    .select("id, name, is_demo")
    .order("name");
  const list = (restaurants ?? []) as { id: string; name: string; is_demo: boolean | null }[];
  const current = list.find((x) => x.id === sp.r) ?? list.find((x) => x.id === "houba") ?? list[0];
  if (!current) {
    return <div className="max-w-5xl mx-auto py-8 px-4 text-sm">Aucun établissement.</div>;
  }

  const listing = await listDailyEntries(current.id);
  if (listing.missing) {
    return (
      <div className="max-w-5xl mx-auto py-8 px-4 space-y-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">CA du jour</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-900">
          <p className="font-semibold">Table du CA du jour absente</p>
          <p className="text-amber-700 text-xs mt-0.5">Appliquer docs/migrations/20261005-2041-ca-du-jour.sql dans Supabase.</p>
        </div>
      </div>
    );
  }

  const entries = listing.rows;
  const byDay = new Map(entries.map((e) => [e.sales_day, e]));
  const today = todayInBrussels();
  const yesterday = addDays(today, -1);
  const day = isDay(sp.jour) ? sp.jour : yesterday;
  const editing: DailyEntry | undefined = byDay.get(day);
  const stats = testStats(entries, today);
  const base = `/platform/ca?r=${encodeURIComponent(current.id)}`;

  const reply =
    editing && editing.amount !== null && editing.outcome !== "historique"
      ? replyMessage(entries, day, editing.amount, editing.tickets)
      : null;

  const delay = stats.medianDelayMin;
  const delayLabel = delay === null ? "—" : delay < 60 ? `${delay} min` : `${Math.floor(delay / 60)} h ${String(delay % 60).padStart(2, "0")}`;

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-5">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Test manuel · {TEST_DAYS} jours</p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">CA du jour</h1>
          <form className="flex items-center gap-2" action="/platform/ca">
            <label htmlFor="r" className="sr-only">Établissement</label>
            <select id="r" name="r" defaultValue={current.id} className={`${INPUT} w-auto`}>
              {list.map((x) => (
                <option key={x.id} value={x.id}>{x.name}{x.is_demo ? " (démo)" : ""}</option>
              ))}
            </select>
            <button type="submit" className="rounded-lg border border-gray-300 dark:border-gray-700 font-semibold text-xs px-3 py-2">Ouvrir</button>
          </form>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 max-w-2xl">
          Chaque matin vers 10 h, envoie le WhatsApp au responsable de la caisse. Quand il répond, note le chiffre ici :
          il part dans les ventes de {current.name} (prévision) et la réponse comparée se prépare. S&apos;il l&apos;envoie de lui-même à la
          fermeture de sa caisse, note le jour des ventes en « De lui-même » : pas de message à lui envoyer le lendemain matin.
          Objectif : 10 réponses sur 14 jours ouverts.
        </p>
      </header>

      {sp.erreur && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{sp.erreur}</div>}
      {sp.ok && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Enregistré : {dayLabel(day)}.</div>}
      {sp.supprime && isDay(sp.supprime) && <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">Supprimé : {dayLabel(sp.supprime)}.</div>}

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3" aria-label="Où en est le test">
        <Stat label="Réponses" value={stats.open ? `${stats.answered}/${stats.open}` : "—"} sub={stats.spontaneous ? `dont ${stats.spontaneous} de lui-même` : "sur les jours ouverts notés"} />
        <Stat label="Sans relance" value={stats.open ? `${stats.firstTry}/${stats.open}` : "—"} sub="dès 10 h, ou de lui-même" />
        <Stat label="Délai médian" value={delayLabel} sub="entre l'envoi et la réponse" />
        <Stat label="Jour du test" value={stats.start ? `${Math.min(stats.elapsed, TEST_DAYS)}` : "—"} sub={`sur ${TEST_DAYS}${stats.toNote.length ? ` · ${stats.toNote.length} à noter` : ""}`} />
      </section>
      <div className={`rounded-xl border px-4 py-3 text-sm ${VERDICT_CLS[stats.verdict.tone]}`}>{stats.verdict.text}</div>

      <div className="grid gap-5 lg:grid-cols-2 items-start">
        <section className={`${CARD} p-5 space-y-4`} aria-labelledby="h-noter">
          <div className="flex items-center justify-between gap-2">
            <h2 id="h-noter" className="text-lg font-bold text-gray-900 dark:text-white">Noter un jour</h2>
            {editing && <span className="text-xs text-gray-500">déjà noté · correction</span>}
          </div>
          <form action={saveDay} className="space-y-4" key={day}>
            <input type="hidden" name="r" value={current.id} />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="jour" className={LABEL}>Jour des ventes</label>
                <input id="jour" name="jour" type="date" required defaultValue={day} max={today} className={INPUT} />
              </div>
              <div className="space-y-1">
                <label htmlFor="envoye" className={LABEL}>Message envoyé à <span className="font-normal text-gray-500">(sauf « De lui-même »)</span></label>
                <input id="envoye" name="envoye" type="time" defaultValue={editing?.asked_at ?? "10:00"} className={INPUT} />
              </div>
            </div>
            <fieldset className="space-y-2">
              <legend className={LABEL}>Ce qui s&apos;est passé</legend>
              <div className="grid grid-cols-2 gap-2">
                {OUTCOMES.map((o) => (
                  <label key={o} className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-800 px-3 py-2 text-sm has-[:checked]:border-gray-900 dark:has-[:checked]:border-white has-[:checked]:font-semibold">
                    <input type="radio" name="issue" value={o} defaultChecked={(editing?.outcome ?? "repondu") === o} />
                    {o === "historique" ? "Historique (avant le test)" : o === "spontane" ? "De lui-même (sans demande)" : OUTCOME_LABEL[o]}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="space-y-1">
              <label htmlFor="montant" className={LABEL}>CA reçu (€, TVA comprise)</label>
              <input
                id="montant"
                name="montant"
                inputMode="decimal"
                autoComplete="off"
                placeholder="1 240"
                defaultValue={editing?.amount != null ? String(editing.amount).replace(".", ",") : ""}
                className={`${INPUT} text-2xl font-bold tabular-nums`}
              />
              <p className="text-xs text-gray-500">Seulement pour « Répondu », « Après relance », « De lui-même » et « Historique ». Ignoré sinon.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="tickets" className={LABEL}>Tickets (s&apos;il le donne)</label>
                <input id="tickets" name="tickets" type="number" min={0} inputMode="numeric" defaultValue={editing?.tickets ?? ""} className={INPUT} />
              </div>
              <div className="space-y-1">
                <label htmlFor="repondu" className={LABEL}>Chiffre reçu à</label>
                <input id="repondu" name="repondu" type="time" defaultValue={editing?.replied_at ?? ""} className={INPUT} />
              </div>
            </div>
            <div className="space-y-1">
              <label htmlFor="note" className={LABEL}>Note (ce qu&apos;il a dit, une gêne…)</label>
              <input id="note" name="note" defaultValue={editing?.note ?? ""} placeholder="ex. « je l'ai que le soir »" className={INPUT} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" className={BTN}>Enregistrer ce jour</button>
              {editing && <Link href={base} className="text-xs text-gray-500 underline underline-offset-2">Nouveau jour</Link>}
            </div>
          </form>
        </section>

        <section className={`${CARD} p-5 space-y-3`} aria-labelledby="h-reponse">
          <h2 id="h-reponse" className="text-lg font-bold text-gray-900 dark:text-white">Réponse à lui envoyer</h2>
          {reply ? (
            <>
              <div id="msg-reponse" className={BUBBLE}>{reply}</div>
              <CopyText targetId="msg-reponse" label="Copier la réponse" />
              <p className="text-xs text-gray-500">Comparée aux jours déjà notés, historique compris.</p>
            </>
          ) : (
            <p className="text-sm text-gray-500">
              {editing?.outcome === "ferme"
                ? "Jour fermé : rien à envoyer, il ne compte pas dans le test."
                : editing?.outcome === "sans_reponse"
                  ? "Pas de réponse : rien à envoyer. Le jour compte quand même dans le test."
                  : "Enregistre le chiffre reçu : la réponse comparée apparaît ici, prête à copier."}
            </p>
          )}
        </section>
      </div>

      <section className={`${CARD} p-5 space-y-3`} aria-labelledby="h-jours">
        <h2 id="h-jours" className="text-lg font-bold text-gray-900 dark:text-white">Les {TEST_DAYS} jours</h2>
        {stats.days.length === 0 ? (
          <p className="text-sm text-gray-500">Le test commence au premier jour noté (hors historique).</p>
        ) : (
          <div className="grid grid-cols-7 gap-1.5">
            {stats.days.map((d) => {
              const e = byDay.get(d);
              // Un chiffre envoyé de lui-même le soir même se note aujourd'hui.
              const future = d > yesterday && !(d === today && e);
              const kind: keyof typeof DAY_CLS = future ? "futur" : e ? e.outcome : "a_noter";
              const label = future ? "" : e ? OUTCOME_LABEL[e.outcome].toLowerCase() : "à noter";
              const value = e?.amount != null ? (e.amount >= 1000 ? `${(e.amount / 1000).toFixed(1).replace(".", ",")}k` : `${Math.round(e.amount)}`) : e?.outcome === "ferme" ? "—" : "";
              const inner = (
                <>
                  <span className="text-[11px]">{weekdayName(d).slice(0, 3)} {Number(d.slice(8))}</span>
                  <b className="text-sm tabular-nums text-gray-900 dark:text-white truncate">{value || " "}</b>
                  <span className="text-[10px] font-semibold truncate">{label}</span>
                </>
              );
              const cls = `grid gap-0.5 rounded-lg border px-1 py-2 text-center min-w-0 ${DAY_CLS[kind]} ${d === day ? "ring-2 ring-gray-900 dark:ring-white" : ""}`;
              return future ? (
                <div key={d} className={cls}>{inner}</div>
              ) : (
                <Link key={d} href={`${base}&jour=${d}`} className={cls} aria-label={`${dayLabel(d)}${label ? `, ${label}` : ""}`}>{inner}</Link>
              );
            })}
          </div>
        )}
        <p className="text-xs text-gray-500">Touche un jour pour le noter ou le corriger.</p>
      </section>

      <section className={`${CARD} p-5 space-y-4`} aria-labelledby="h-messages">
        <h2 id="h-messages" className="text-lg font-bold text-gray-900 dark:text-white">Messages à copier</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Message id="msg-matin" title={`Chaque matin à 10 h (pour ${weekdayName(day)})`} text={morningMessage(day)} />
          <Message id="msg-relance" title="Relance à 15 h, si pas de réponse" text={reminderMessage(day)} />
          <Message id="msg-recap" title="Le lundi, au propriétaire" text={weeklyRecap(entries, today, current.name)} />
        </div>
      </section>

      <section className={`${CARD} p-5 space-y-3`} aria-labelledby="h-tous">
        <h2 id="h-tous" className="text-lg font-bold text-gray-900 dark:text-white">Tous les jours notés</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Les chiffres d&apos;avant le test (lus sur Belpeople par le propriétaire) se notent avec l&apos;issue « Historique » : les comparaisons marchent dès le premier jour.
        </p>
        {entries.length === 0 ? (
          <p className="text-sm text-gray-500">Aucun jour noté pour l&apos;instant.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500">
                  <th className="py-2 pr-3 font-semibold">Jour</th>
                  <th className="py-2 pr-3 font-semibold">CA</th>
                  <th className="py-2 pr-3 font-semibold">Issue</th>
                  <th className="py-2 pr-3 font-semibold">Note</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.sales_day} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="py-2 pr-3 whitespace-nowrap"><Link href={`${base}&jour=${e.sales_day}`} className="underline-offset-2 hover:underline">{dayLabel(e.sales_day)}</Link></td>
                    <td className="py-2 pr-3 tabular-nums whitespace-nowrap">{e.amount != null ? eur(e.amount) : "—"}{e.tickets ? <span className="text-gray-500"> · {e.tickets} t.</span> : null}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{OUTCOME_LABEL[e.outcome]}</td>
                    <td className="py-2 pr-3 text-gray-500">{e.note ?? ""}</td>
                    <td className="py-2 text-right">
                      <form action={deleteDay}>
                        <input type="hidden" name="r" value={current.id} />
                        <input type="hidden" name="jour" value={e.sales_day} />
                        <button type="submit" className="text-xs text-gray-500 underline underline-offset-2">Supprimer</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-gray-500">
          Les jours avec un montant alimentent la <Link href={`/admin/${encodeURIComponent(current.id)}/forecast`} className="underline underline-offset-2">prévision de {current.name}</Link> (à partir de 20 jours sur 4 semaines).
        </p>
      </section>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className={`${CARD} px-4 py-3`}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-2xl font-bold tabular-nums text-gray-900 dark:text-white">{value}</p>
      <p className="text-[11px] text-gray-500">{sub}</p>
    </div>
  );
}

function Message({ id, title, text }: { id: string; title: string; text: string }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{title}</p>
      <div id={id} className={BUBBLE}>{text}</div>
      <CopyText targetId={id} />
    </div>
  );
}
