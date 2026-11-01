import { redirect } from "next/navigation";
import { createServerSupabaseClient, createAdminClient } from "@/lib/supabase";
import { CopyText } from "@/components/platform/CopyText";
import {
  AFTER_VISIT_FIELDS,
  CASE_STUDY_SLUG,
  DONT_INSIST,
  FINDINGS_EXAMPLES,
  LEAVE_BEHIND,
  MESSAGES,
  OBJECTIONS,
  OFFER_CHOICE,
  PLANS,
  PREP_STEPS,
  SCRIPT,
  VISIT_RULES,
  WEEKLY_REVIEW,
  textBlocks,
} from "@/lib/visit-kit";

export const metadata = { title: "Kit de visite — Plateforme" };

export const dynamic = "force-dynamic";

// Kit de visite des associés (prospection des indépendants de Bruxelles,
// .claude/product-marketing.md). Le texte général vit dans lib/visit-kit.ts ;
// le cas client vit en base (`platform_documents`), parce que le dépôt est
// public. Lecture fail-open : sans la table ou sans la ligne, la page s'affiche
// et le cadre dit ce qui manque — jamais un échec muet.

type CaseStudy = { title: string; body: string; updated_at: string } | null;

async function loadCaseStudy(): Promise<{ doc: CaseStudy; error: string | null }> {
  try {
    const { data, error } = await createAdminClient()
      .from("platform_documents")
      .select("title, body, updated_at")
      .eq("slug", CASE_STUDY_SLUG)
      .maybeSingle();
    if (error) return { doc: null, error: error.message };
    return { doc: (data as CaseStudy) ?? null, error: null };
  } catch (e) {
    return { doc: null, error: e instanceof Error ? e.message : "lecture impossible" };
  }
}

const SECTIONS = [
  { id: "avant", label: "Avant" },
  { id: "script", label: "Script" },
  { id: "preuve", label: "Preuve" },
  { id: "offre", label: "Offre" },
  { id: "page", label: "Page à laisser" },
  { id: "messages", label: "Messages" },
  { id: "objections", label: "Objections" },
  { id: "apres", label: "Après" },
];

const card = "rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 sm:p-5";
const h2 = "text-lg font-bold text-gray-900 dark:text-gray-100 scroll-mt-20";
const muted = "text-sm text-gray-600 dark:text-gray-400";
const body = "text-[15px] leading-relaxed text-gray-800 dark:text-gray-200";

function Quote({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-l-4 border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 rounded-r-lg px-3 py-2 text-[15px] leading-relaxed text-gray-900 dark:text-gray-100 italic">
      « {children} »
    </p>
  );
}

export default async function PlatformKitPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  if (!profile?.is_super_admin) redirect("/join?reason=platform-required");

  const { doc, error } = await loadCaseStudy();

  return (
    <div className="max-w-3xl mx-auto px-4 py-5 space-y-6">
      <header className="space-y-2">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Kit de visite</h1>
        <p className={muted}>Restaurants indépendants de Bruxelles · 20 minutes au comptoir, entre 14 h et 17 h.</p>
        <nav aria-label="Sections du kit" className="flex flex-wrap gap-2 pt-1">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="rounded-full border border-gray-300 dark:border-gray-700 px-3 py-1 text-xs font-semibold text-gray-700 dark:text-gray-200">
              {s.label}
            </a>
          ))}
        </nav>
      </header>

      <section className={card}>
        <h2 className="font-bold text-gray-900 dark:text-gray-100 mb-2">Les cinq règles</h2>
        <ol className={`${body} list-decimal pl-5 space-y-1`}>
          {VISIT_RULES.map((r) => <li key={r}>{r}</li>)}
        </ol>
      </section>

      <section id="avant" className="space-y-3">
        <h2 className={h2}>1. Avant la visite — 5 minutes</h2>
        {PREP_STEPS.map((s, i) => (
          <div key={s.title} className={card}>
            <p className="font-semibold text-gray-900 dark:text-gray-100">{i + 1}. {s.title}</p>
            <p className={`${body} mt-1`}>{s.body}</p>
          </div>
        ))}
        <div className={card}>
          <p className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Les trois constats</p>
          <ul className="space-y-2">
            {FINDINGS_EXAMPLES.map((f) => (
              <li key={f.box} className={body}>
                <span className="font-semibold">{f.box}</span> <span className={muted}>— dans {f.where}</span>
                <br />{f.example}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="script" className="space-y-3">
        <h2 className={h2}>2. Le script — 20 minutes</h2>
        {SCRIPT.map((step) => (
          <div key={step.time} className={`${card} space-y-2`}>
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">{step.time}</p>
            <p className="font-semibold text-gray-900 dark:text-gray-100">{step.title}</p>
            {step.say?.map((s) => <Quote key={s}>{s}</Quote>)}
            {step.lines.length > 0 && (
              <ul className={`${body} list-disc pl-5 space-y-1`}>
                {step.lines.map((l) => <li key={l}>{l}</li>)}
              </ul>
            )}
          </div>
        ))}
      </section>

      <section id="preuve" className="space-y-3">
        <h2 className={h2}>3. La preuve : le cas client</h2>
        <div className={`${card} space-y-3`}>
          {doc ? (
            <>
              <p className="font-semibold text-gray-900 dark:text-gray-100">{doc.title}</p>
              {textBlocks(doc.body).map((b, i) =>
                b.kind === "p" ? (
                  <p key={i} className={body}>{b.text}</p>
                ) : (
                  <ul key={i} className={`${body} list-disc pl-5 space-y-1`}>
                    {b.items.map((it) => <li key={it}>{it}</li>)}
                  </ul>
                ),
              )}
              <p className={muted}>Interne aux associés, jamais publié sur le site sans l&apos;accord du restaurant. Mis à jour le {new Date(doc.updated_at).toLocaleDateString("fr-BE")}.</p>
            </>
          ) : (
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">
              Cas client introuvable ({error ? `erreur : ${error}` : `aucune ligne « ${CASE_STUDY_SLUG} » dans platform_documents`}). Appliquer la migration 20261101-2024 et insérer le texte.
            </p>
          )}
        </div>
      </section>

      <section id="offre" className="space-y-3">
        <h2 className={h2}>4. L&apos;offre — on commence toujours par le Gratuit</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className={card}>
            <p className="font-bold text-gray-900 dark:text-gray-100">{OFFER_CHOICE.free.label}</p>
            <p className={`${body} mt-1`}>{OFFER_CHOICE.free.when}</p>
            <p className={`${muted} mt-2`}>{OFFER_CHOICE.free.then}</p>
          </div>
          <div className={card}>
            <p className="font-bold text-gray-900 dark:text-gray-100">{OFFER_CHOICE.pro.label}</p>
            <p className={`${body} mt-1`}>{OFFER_CHOICE.pro.when}</p>
            <ul className={`${muted} list-disc pl-5 mt-2 space-y-0.5`}>
              {OFFER_CHOICE.pro.signs.map((s) => <li key={s}>{s}</li>)}
            </ul>
            <p className={`${muted} mt-2`}>{OFFER_CHOICE.pro.then}</p>
          </div>
        </div>
        <p className={muted}>{OFFER_CHOICE.note}</p>
        <div className="space-y-2">
          {PLANS.map((p) => (
            <div key={p.name} className={card}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-bold text-gray-900 dark:text-gray-100">{p.name} <span className="font-normal text-gray-600 dark:text-gray-400">— {p.tagline}</span></p>
                <p className="font-semibold text-gray-900 dark:text-gray-100">{p.price}</p>
              </div>
              <p className={`${body} mt-1`}>{p.content}</p>
              <p className={`${muted} mt-1`}>Pub de quartier : frais de {p.adFee}</p>
            </div>
          ))}
          <p className={muted}>Prix HTVA, par établissement.</p>
        </div>
      </section>

      <section id="page" className="space-y-3">
        <h2 className={h2}>5. La page à laisser au comptoir</h2>
        <div className={`${card} space-y-3`}>
          <p className="text-xl font-black text-gray-900 dark:text-gray-100">{LEAVE_BEHIND.title}</p>
          <p className="font-semibold text-emerald-700 dark:text-emerald-400">{LEAVE_BEHIND.subtitle}</p>
          <div className="grid sm:grid-cols-3 gap-3">
            {LEAVE_BEHIND.pillars.map((p) => (
              <div key={p.name}>
                <p className="font-bold text-gray-900 dark:text-gray-100">{p.name}</p>
                <p className="text-sm leading-relaxed text-gray-800 dark:text-gray-200 mt-1">{p.body}</p>
              </div>
            ))}
          </div>
          <p className={body}>{LEAVE_BEHIND.gifts}</p>
          <p className="font-semibold text-gray-900 dark:text-gray-100">{LEAVE_BEHIND.cta}</p>
          <p className={muted}>À compléter avant impression : le numéro WhatsApp, et une phrase d&apos;un restaurateur client avec son accord.</p>
        </div>
      </section>

      <section id="messages" className="space-y-3">
        <h2 className={h2}>6. Les messages</h2>
        <p className={muted}>Chaque message part à la main, un par un, avec un constat vrai sur son restaurant. Si on nous demande d&apos;arrêter : case « Ne plus contacter » dans le CRM.</p>
        {MESSAGES.map((m) => (
          <div key={m.id} className={`${card} space-y-2`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-900 dark:text-gray-100">{m.title}</p>
                <p className={muted}>{m.when}</p>
              </div>
              <CopyText targetId={m.id} />
            </div>
            <p id={m.id} className={`${body} whitespace-pre-line`}>{m.text}</p>
          </div>
        ))}
      </section>

      <section id="objections" className="space-y-3">
        <h2 className={h2}>7. Les objections</h2>
        <p className={muted}>On reconnaît, on répond à la vraie inquiétude, on finit par une question.</p>
        {OBJECTIONS.map((o) => (
          <details key={o.said} className={card}>
            <summary className="cursor-pointer font-semibold text-gray-900 dark:text-gray-100">{o.said}</summary>
            <div className="mt-2 space-y-2">
              <p className={muted}>Ce qui l&apos;inquiète : {o.worry}</p>
              <Quote>{o.answer}</Quote>
              <p className={body}><span className="font-semibold">Relance :</span> « {o.ask} »</p>
            </div>
          </details>
        ))}
        <p className={body}><span className="font-semibold">Quand ne pas insister :</span> {DONT_INSIST}</p>
      </section>

      <section id="apres" className="space-y-3">
        <h2 className={h2}>8. Après la visite — dans le CRM, le jour même</h2>
        <div className={card}>
          <dl className="divide-y divide-gray-100 dark:divide-gray-800">
            {AFTER_VISIT_FIELDS.map((f) => (
              <div key={f.field} className="py-2 sm:flex sm:gap-4">
                <dt className="font-semibold text-sm text-gray-900 dark:text-gray-100 sm:w-48 shrink-0">{f.field}</dt>
                <dd className="text-sm text-gray-700 dark:text-gray-300">{f.fill}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className={body}>{WEEKLY_REVIEW}</p>
      </section>
    </div>
  );
}
