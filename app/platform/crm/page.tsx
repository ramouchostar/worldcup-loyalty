import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { listEvents, listProspects, type EventRow, type ProspectRow } from "@/lib/crm";
import {
  CRM_OFFER_LABEL,
  CRM_STATUSES,
  CRM_STATUS_LABEL,
  CRM_STRATEGIES,
  MIN_SAMPLE,
  STRATEGIES,
  WEEKLY_SIGNED_TARGET,
  isBelgianMobile,
  measuredRates,
  toE164,
  weekCounts,
  weekStart,
  weeklyPlan,
  type CrmStatus,
  type CrmStrategy,
} from "@/lib/crm-model";
import { isPlacesConfigured } from "@/lib/audit/places";
import { BRUSSELS_POSTAL_CODES } from "@/lib/audit/brussels";
import {
  discoverFromGoogle,
  enrichFromGoogle,
  importJson,
  logContact,
  setStatus,
  startProspectAudit,
  updateDetails,
} from "./actions";

export const metadata = { title: "CRM — Plateforme" };
export const dynamic = "force-dynamic";
// L'audit lancé depuis une fiche tourne en tâche de fond après la redirection.
export const maxDuration = 300;

type Search = Promise<Record<string, string | undefined>>;

const OPEN: CrmStatus[] = ["a_qualifier", "a_contacter", "contacte", "rdv_audit", "audit_presente"];

const CARD = "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl";
const INPUT = "w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent px-2.5 py-1.5 text-sm";
const BTN = "rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-semibold text-xs px-3 py-2";
const BTN_GHOST = "rounded-lg border border-gray-300 dark:border-gray-700 font-semibold text-xs px-3 py-2 text-gray-700 dark:text-gray-200";

// ADR 0076 — le CRM de prospection : l'objectif de la semaine, les quatre
// stratégies, la liste à travailler. La liste vient d'un import (recherche
// préparée) ou de Google Maps (bouton « Trouver »), jamais du code : le dépôt
// est public.
export default async function PlatformCrmPage({ searchParams }: { searchParams: Search }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  if (!profile?.is_super_admin) redirect("/join?reason=platform-required");

  const sp = await searchParams;
  const [prospects, events] = await Promise.all([listProspects(), listEvents()]);

  if (prospects.missing || events.missing) {
    return (
      <div className="max-w-5xl mx-auto py-8 px-4 space-y-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">CRM</h1>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-900">
          <p className="font-semibold">Tables du CRM absentes</p>
          <p className="text-amber-700 text-xs mt-0.5">Appliquer docs/migrations/20261003-0020-crm-prospection.sql dans Supabase.</p>
        </div>
      </div>
    );
  }

  const rows = prospects.rows;
  const evs = events.rows;
  const statusEvents = evs.filter((e) => e.kind === "statut");
  const thisWeek = weekCounts(statusEvents, weekStart(new Date()));
  const lastWeek = weekCounts(statusEvents, new Date(weekStart(new Date()).getTime() - 7 * 86_400_000));
  const { rates, measured, samples } = measuredRates(statusEvents);
  const plan = weeklyPlan(rates);
  const today = new Date().toISOString().slice(0, 10);

  const filterStatus = CRM_STATUSES.includes(sp.statut as CrmStatus) ? (sp.statut as CrmStatus) : null;
  const filterStrategy = CRM_STRATEGIES.includes(sp.strategie as CrmStrategy) ? (sp.strategie as CrmStrategy) : null;
  const q = (sp.q ?? "").trim().toLowerCase();
  const visible = rows.filter(
    (p) =>
      (filterStatus ? p.status === filterStatus : sp.statut === "tous" || OPEN.includes(p.status)) &&
      (!filterStrategy || p.strategy === filterStrategy) &&
      (!q || `${p.name} ${p.commune ?? ""} ${p.category ?? ""} ${p.owner_name ?? ""}`.toLowerCase().includes(q)),
  );
  const due = rows.filter((p) => OPEN.includes(p.status) && !p.do_not_contact && p.next_action_at && p.next_action_at <= today);
  const eventsByProspect = new Map<string, EventRow[]>();
  for (const e of evs) eventsByProspect.set(e.prospect_id, [...(eventsByProspect.get(e.prospect_id) ?? []), e]);
  const countBy = (s: CrmStatus) => rows.filter((p) => p.status === s).length;
  const toWork = rows.filter((p) => OPEN.includes(p.status) && !p.do_not_contact).length;

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 space-y-6">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">CRM</h1>
          <p className="text-gray-500 text-sm mt-1">
            Prospection restaurateurs à Bruxelles · objectif {WEEKLY_SIGNED_TARGET} signés par semaine · l&apos;audit gratuit ouvre la porte.
          </p>
        </div>
        <a href="https://github.com/ramouchostar/worldcup-loyalty/blob/master/docs/strategie/prospection-bruxelles.md" className="text-xs font-semibold text-gray-600 dark:text-gray-300 underline">
          Guide des 4 stratégies
        </a>
      </div>

      <Flash sp={sp} />

      {/* Objectif de la semaine : ce qui est fait vs ce qu'il faut, d'après les taux réels quand ils existent. */}
      <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <WeekTile label="Contactés" value={thisWeek.contacts} target={plan.contacts} last={lastWeek.contacts} />
        <WeekTile label="RDV audit pris" value={thisWeek.rdv} target={plan.rdv} last={lastWeek.rdv} />
        <WeekTile label="Audits présentés" value={thisWeek.audits} target={plan.audits} last={lastWeek.audits} />
        <WeekTile label="Signés" value={thisWeek.signed} target={plan.signed} last={lastWeek.signed} strong />
      </section>
      <p className="text-xs text-gray-500 -mt-3">
        Semaine du lundi {weekStart(new Date()).toLocaleDateString("fr-BE")}. Taux utilisés : contact → RDV {pct(rates.contactToRdv)}
        {measured.contactToRdv ? ` (mesuré sur ${samples.contactToRdv})` : " (hypothèse)"} · RDV → audit {pct(rates.rdvToAudit)}
        {measured.rdvToAudit ? ` (mesuré sur ${samples.rdvToAudit})` : " (hypothèse)"} · audit → signé {pct(rates.auditToSigned)}
        {measured.auditToSigned ? ` (mesuré sur ${samples.auditToSigned})` : " (hypothèse)"}. Un taux devient mesuré à {MIN_SAMPLE} prospects.
        {" "}Pipeline ouvert : {toWork} prospect{toWork > 1 ? "s" : ""}
        {toWork < plan.contacts ? ` — moins que les ${plan.contacts} contacts de la semaine : remplir avec « Trouver sur Google Maps ».` : "."}
      </p>

      {/* Les quatre stratégies, avec leur offre et le nombre de prospects concernés. */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {CRM_STRATEGIES.map((k) => {
          const s = STRATEGIES[k];
          const open = rows.filter((p) => p.strategy === k && OPEN.includes(p.status)).length;
          const signed = rows.filter((p) => p.strategy === k && p.status === "signe").length;
          return (
            <Link key={k} href={`/platform/crm?strategie=${k}`} className={`${CARD} p-3 block hover:border-gray-400 ${filterStrategy === k ? "ring-2 ring-gray-900 dark:ring-white" : ""}`}>
              <p className="text-sm font-bold text-gray-900 dark:text-white">{s.label}</p>
              <p className="text-[11px] font-semibold text-gray-600 dark:text-gray-300 mt-0.5">{CRM_OFFER_LABEL[s.offer]}</p>
              <p className="text-xs text-gray-500 mt-1.5">{s.who}</p>
              <p className="text-xs text-gray-500 mt-1.5 tabular-nums">{open} en cours · {signed} signé{signed > 1 ? "s" : ""}</p>
            </Link>
          );
        })}
      </section>

      {due.length > 0 && (
        <section className={`${CARD} p-4`}>
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">À faire aujourd&apos;hui ({due.length})</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {due.map((p) => (
              <li key={p.id}>
                <a href={`#p-${p.id}`} className="inline-block rounded-full border border-gray-300 dark:border-gray-700 px-3 py-1 text-xs font-semibold text-gray-700 dark:text-gray-200">
                  {p.name} · {CRM_STATUS_LABEL[p.status]}
                  {p.next_action_at && p.next_action_at < today ? " · en retard" : ""}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Filtres */}
      <section className="flex flex-wrap items-center gap-2">
        <FilterLink href="/platform/crm" active={!filterStatus && sp.statut !== "tous"} label={`En cours (${rows.filter((p) => OPEN.includes(p.status)).length})`} />
        {CRM_STATUSES.map((s) => (
          <FilterLink key={s} href={`/platform/crm?statut=${s}`} active={filterStatus === s} label={`${CRM_STATUS_LABEL[s]} (${countBy(s)})`} />
        ))}
        <FilterLink href="/platform/crm?statut=tous" active={sp.statut === "tous"} label={`Tous (${rows.length})`} />
        <form className="ml-auto flex gap-2" action="/platform/crm">
          {filterStatus && <input type="hidden" name="statut" value={filterStatus} />}
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Nom, commune, gérant…" className={`${INPUT} w-48`} />
          <button className={BTN_GHOST}>Chercher</button>
        </form>
      </section>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">Aucun prospect : importe la liste préparée ou lance une recherche Google Maps ci-dessous.</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-gray-500">Aucun prospect pour ce filtre.</p>
      ) : (
        <ul className="space-y-2">
          {visible.map((p) => (
            <ProspectCard key={p.id} p={p} events={eventsByProspect.get(p.id) ?? []} today={today} />
          ))}
        </ul>
      )}

      <Tools />
    </div>
  );
}

function pct(x: number) {
  return `${Math.round(x * 100)} %`;
}

function WeekTile({ label, value, target, last, strong }: { label: string; value: number; target: number; last: number; strong?: boolean }) {
  const ratio = Math.min(value / Math.max(target, 1), 1);
  return (
    <div className={`${CARD} p-3`}>
      <p className="text-xs font-semibold text-gray-500">{label}</p>
      <p className={`mt-1 tabular-nums ${strong ? "text-3xl" : "text-2xl"} font-black text-gray-900 dark:text-white`}>
        {value}
        <span className="text-sm font-semibold text-gray-400"> / {target}</span>
      </p>
      <div className="mt-2 h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden" aria-hidden="true">
        <div className={`h-full rounded-full ${value >= target ? "bg-emerald-600" : "bg-gray-900 dark:bg-gray-200"}`} style={{ width: `${ratio * 100}%` }} />
      </div>
      <p className="mt-1.5 text-[11px] text-gray-500 tabular-nums">Semaine précédente : {last}</p>
    </div>
  );
}

function FilterLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1 text-xs font-semibold border ${
        active ? "bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-gray-900" : "border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300"
      }`}
    >
      {label}
    </Link>
  );
}

function Flash({ sp }: { sp: Record<string, string | undefined> }) {
  let msg: string | null = null;
  if (sp.import === "illisible") msg = "Import refusé : le texte collé n'est pas un tableau JSON.";
  if (sp.import === "ok")
    msg = `Import : ${sp.crees} créé(s), ${sp.doublons} déjà présent(s), ${sp.refuses} refusé(s)${sp.motifs ? ` — ${sp.motifs}` : ""}.`;
  if (sp.google === "non_branche") msg = "GOOGLE_PLACES_API_KEY absente sur ce déploiement : la recherche Google Maps est indisponible.";
  if (sp.google === "echec") msg = `Google Maps a échoué : ${sp.motif ?? "motif inconnu"}.`;
  if (sp.google === "introuvable") msg = `Aucune fiche Google trouvée pour « ${sp.nom} ».`;
  if (sp.google === "relie") msg = `Fiche Google reliée : ${sp.nom}. Vérifie que c'est bien le bon établissement.`;
  if (sp.google === "ok")
    msg = `« ${sp.recherche} » : ${sp.lus} fiche(s) lue(s), ${sp.crees} ajoutée(s) à qualifier, ${sp.doublons} déjà présente(s). Écartées : ${sp.x_chaine} chaîne(s), ${sp.x_hors_bruxelles} hors Bruxelles, ${sp.x_type} hors cible, ${sp.x_peu_d_avis} avec moins de 50 avis.`;
  if (!msg) return null;
  return <p className={`${CARD} px-4 py-3 text-sm text-gray-700 dark:text-gray-200`}>{msg}</p>;
}

function ProspectCard({ p, events, today }: { p: ProspectRow; events: EventRow[]; today: string }) {
  const phone = toE164(p.phone);
  const wa = isBelgianMobile(phone) ? `https://wa.me/${phone!.slice(1)}?text=${encodeURIComponent(p.pitch ?? "")}` : null;
  const mail = p.email
    ? `mailto:${p.email}?subject=${encodeURIComponent(`Audit gratuit de ${p.name}`)}&body=${encodeURIComponent(p.pitch ?? "")}`
    : null;
  const late = p.next_action_at && p.next_action_at < today && OPEN.includes(p.status);
  const s = STRATEGIES[p.strategy];

  return (
    <li id={`p-${p.id}`} className={`${CARD} scroll-mt-20`}>
      <details>
        <summary className="cursor-pointer list-none px-4 py-3 grid gap-2 sm:grid-cols-[1fr_auto] items-center">
          <div className="min-w-0">
            <p className="font-bold text-gray-900 dark:text-white truncate">
              {p.name}
              {p.do_not_contact && <span className="ml-2 text-[11px] font-semibold text-red-700">ne plus contacter</span>}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {[p.commune, p.category, p.locations > 1 ? `${p.locations} sites` : null, p.rating != null ? `${p.rating.toFixed(1)} ★ (${p.reviews_count ?? "?"} avis)` : "note inconnue", p.owner_name ? `gérant : ${p.owner_name}` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
            <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-gray-700 dark:text-gray-200">{s.label}</span>
            <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-gray-700 dark:text-gray-200">{CRM_OFFER_LABEL[p.offer]}</span>
            <span className={`rounded-full px-2 py-0.5 ${p.status === "signe" ? "bg-emerald-100 text-emerald-900" : "bg-gray-900 text-white dark:bg-white dark:text-gray-900"}`}>
              {CRM_STATUS_LABEL[p.status]}
            </span>
            {p.next_action_at && OPEN.includes(p.status) && (
              <span className={`rounded-full px-2 py-0.5 ${late ? "bg-amber-100 text-amber-900" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"}`}>
                {late ? "en retard · " : ""}
                {new Date(p.next_action_at).toLocaleDateString("fr-BE")}
              </span>
            )}
          </div>
        </summary>

        <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-4 grid gap-5 lg:grid-cols-2">
          {/* Colonne gauche : contacter */}
          <div className="space-y-4 text-sm">
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">Message d&apos;approche ({s.label})</p>
              <p className="rounded-xl bg-gray-50 dark:bg-gray-800 px-3 py-2 text-gray-800 dark:text-gray-100 select-all">{p.pitch}</p>
              <p className="text-xs text-gray-500 mt-1">Angle : {s.angle}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {phone && <a href={`tel:${phone}`} className={BTN_GHOST}>Appeler {p.phone}</a>}
              {wa && <a href={wa} target="_blank" rel="noreferrer" className={BTN_GHOST}>WhatsApp (message prêt)</a>}
              {mail && <a href={mail} className={BTN_GHOST}>E-mail (message prêt)</a>}
              {p.website && <a href={p.website} target="_blank" rel="noreferrer" className={BTN_GHOST}>Site</a>}
              {p.instagram && <a href={p.instagram} target="_blank" rel="noreferrer" className={BTN_GHOST}>Instagram</a>}
              {p.facebook && <a href={p.facebook} target="_blank" rel="noreferrer" className={BTN_GHOST}>Facebook</a>}
              {p.maps_uri && <a href={p.maps_uri} target="_blank" rel="noreferrer" className={BTN_GHOST}>Google Maps</a>}
            </div>

            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-gray-500">Adresse</dt><dd>{p.address ?? "—"}</dd>
              <dt className="text-gray-500">Téléphone</dt><dd>{p.phone ?? "— à trouver"}</dd>
              <dt className="text-gray-500">E-mail</dt><dd>{p.email ?? "— à trouver"}</dd>
              <dt className="text-gray-500">Gérant</dt>
              <dd>{p.owner_name ? `${p.owner_name}${p.owner_role ? ` (${p.owner_role})` : ""}` : "— à identifier (BCE ou sur place)"}</dd>
              <dt className="text-gray-500">Contact gérant</dt><dd>{p.owner_contact ?? "—"}</dd>
              <dt className="text-gray-500">BCE</dt>
              <dd>
                {p.company_number ? (
                  <a className="underline" target="_blank" rel="noreferrer" href={`https://kbopub.economie.fgov.be/kbopub/zoeknummerform.html?nummer=${p.company_number.replace(/\D/g, "")}&actionLu=Recherche`}>
                    {p.company_number}
                  </a>
                ) : "—"}
              </dd>
              <dt className="text-gray-500">Livraison</dt><dd>{p.delivery.length ? p.delivery.join(", ") : "—"}</dd>
              <dt className="text-gray-500">Ouvert en</dt><dd>{p.opened_year ?? "—"}</dd>
            </dl>

            {p.signals.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">Constats</p>
                <ul className="list-disc pl-4 text-xs space-y-0.5">{p.signals.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </div>
            )}
            {p.sources.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-gray-500">Sources ({p.sources.length})</summary>
                <ul className="mt-1 space-y-0.5">
                  {p.sources.map((u) => (
                    <li key={u} className="truncate"><a className="underline text-gray-600 dark:text-gray-300" href={u} target="_blank" rel="noreferrer">{u}</a></li>
                  ))}
                </ul>
              </details>
            )}

            <div className="flex flex-wrap gap-2">
              <form action={enrichFromGoogle.bind(null, p.id)}><button className={BTN_GHOST}>{p.place_id ? "Rafraîchir depuis Google" : "Relier la fiche Google"}</button></form>
              {p.audit_id ? (
                <Link href={`/platform/audit/${p.audit_id}`} className={BTN}>Voir l&apos;audit</Link>
              ) : (
                <form action={startProspectAudit.bind(null, p.id)}><button className={BTN}>Lancer l&apos;audit</button></form>
              )}
            </div>
          </div>

          {/* Colonne droite : faire avancer */}
          <div className="space-y-4">
            <form action={logContact.bind(null, p.id)} className="space-y-2">
              <p className="text-xs font-semibold text-gray-500">Noter un échange</p>
              <div className="grid grid-cols-[auto_1fr] gap-2">
                <select name="kind" className={INPUT} defaultValue="appel">
                  <option value="appel">Appel</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">E-mail</option>
                  <option value="visite">Visite</option>
                  <option value="note">Note</option>
                </select>
                <input name="note" placeholder="Ce qui s'est dit, objection, prochaine étape…" className={INPUT} />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">Relancer le</label>
                <input type="date" name="next_action_at" className={`${INPUT} w-40`} />
                <button className={BTN}>Enregistrer</button>
              </div>
            </form>

            <form action={setStatus.bind(null, p.id)} className="space-y-2">
              <p className="text-xs font-semibold text-gray-500">Statut</p>
              <div className="flex flex-wrap items-center gap-2">
                <select name="status" defaultValue={p.status} className={`${INPUT} w-44`}>
                  {CRM_STATUSES.map((st) => <option key={st} value={st}>{CRM_STATUS_LABEL[st]}</option>)}
                </select>
                <input name="lost_reason" placeholder="Si perdu : pourquoi" defaultValue={p.lost_reason ?? ""} className={`${INPUT} flex-1 min-w-[10rem]`} />
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                <input type="checkbox" name="do_not_contact" defaultChecked={p.do_not_contact} /> Ne plus contacter (il l&apos;a demandé)
              </label>
              <button className={BTN}>Mettre à jour</button>
            </form>

            <details>
              <summary className="cursor-pointer text-xs font-semibold text-gray-500">Modifier la fiche</summary>
              <form action={updateDetails.bind(null, p.id)} className="mt-2 grid gap-2 sm:grid-cols-2 text-xs">
                <label>Stratégie
                  <select name="strategy" defaultValue={p.strategy} className={INPUT}>
                    {CRM_STRATEGIES.map((k) => <option key={k} value={k}>{STRATEGIES[k].label}</option>)}
                  </select>
                </label>
                <label>Offre
                  <select name="offer" defaultValue={p.offer} className={INPUT}>
                    <option value="gratuit">{CRM_OFFER_LABEL.gratuit}</option>
                    <option value="pro_2_mois">{CRM_OFFER_LABEL.pro_2_mois}</option>
                  </select>
                </label>
                <label>Téléphone<input name="phone" defaultValue={p.phone ?? ""} className={INPUT} /></label>
                <label>E-mail<input name="email" defaultValue={p.email ?? ""} className={INPUT} /></label>
                <label>Gérant<input name="owner_name" defaultValue={p.owner_name ?? ""} className={INPUT} /></label>
                <label>Contact du gérant<input name="owner_contact" defaultValue={p.owner_contact ?? ""} className={INPUT} /></label>
                <label>Porté par<input name="owner_user" defaultValue={p.owner_user ?? ""} placeholder="Mehdi, Omar…" className={INPUT} /></label>
                <label>Prochaine action<input type="date" name="next_action_at" defaultValue={p.next_action_at ?? ""} className={INPUT} /></label>
                <label className="sm:col-span-2">Message d&apos;approche<textarea name="pitch" rows={3} defaultValue={p.pitch ?? ""} className={INPUT} /></label>
                <label className="sm:col-span-2">Notes<textarea name="notes" rows={3} defaultValue={p.notes ?? ""} className={INPUT} /></label>
                {p.status === "a_qualifier" && (
                  <label className="sm:col-span-2 flex items-center gap-2"><input type="checkbox" name="qualifier" defaultChecked /> Qualifié : passer en « À contacter »</label>
                )}
                <div className="sm:col-span-2"><button className={BTN}>Enregistrer la fiche</button></div>
              </form>
            </details>

            {p.notes && <p className="text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{p.notes}</p>}

            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">Historique</p>
              {events.length === 0 ? (
                <p className="text-xs text-gray-400">Aucun échange noté.</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {events.slice(0, 12).map((e) => (
                    <li key={e.id} className="text-gray-600 dark:text-gray-300">
                      <span className="tabular-nums text-gray-400">{new Date(e.created_at).toLocaleDateString("fr-BE")}</span>{" "}
                      {e.kind === "statut"
                        ? `${CRM_STATUS_LABEL[e.from_status as CrmStatus] ?? e.from_status} → ${CRM_STATUS_LABEL[e.to_status as CrmStatus] ?? e.to_status}`
                        : e.kind}
                      {e.note ? ` — ${e.note}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </details>
    </li>
  );
}

function Tools() {
  const communes = Array.from(new Set(Object.values(BRUSSELS_POSTAL_CODES)));
  return (
    <section className="grid gap-3 lg:grid-cols-2">
      <form action={discoverFromGoogle} className={`${CARD} p-4 space-y-3`}>
        <div>
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Trouver sur Google Maps</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Jusqu&apos;à 20 fiches par recherche, ajoutées « à qualifier ». Chaînes, hors Bruxelles et fiches de moins de 50 avis écartées (et comptées).
            {!isPlacesConfigured() && " GOOGLE_PLACES_API_KEY absente sur ce déploiement."}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select name="quoi" className={INPUT} defaultValue="smash burger">
            {["smash burger", "fast food", "poulet frit", "pita kebab", "tacos", "pizza à emporter", "poke bowl", "snack friterie", "bagel sandwich", "brunch café"].map((x) => (
              <option key={x} value={x}>{x}</option>
            ))}
          </select>
          <select name="ou" className={INPUT} defaultValue="Ixelles">
            {communes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button className={BTN}>Trouver</button>
      </form>

      <form action={importJson} className={`${CARD} p-4 space-y-3`}>
        <div>
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Importer une liste</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Tableau JSON (name, address, postal_code, phone, email, owner_name, signals, sources, strategy, offer, pitch…). Un établissement déjà présent n&apos;est ni dédoublé ni écrasé.
          </p>
        </div>
        <textarea name="json" rows={4} placeholder='[{"name": "…", "postal_code": "1050", …}]' className={`${INPUT} font-mono text-xs`} />
        <button className={BTN}>Importer</button>
      </form>
    </section>
  );
}
