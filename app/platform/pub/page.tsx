import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { loadPlatformPub, metaIdentities } from "@/lib/ads/platform";
import { formatEur } from "@/lib/ads/money";
import { todayBrussels } from "@/lib/ads/sync";
import { AttachForm, ConfirmPayment, IdentityForm, InvoiceForm, LaunchControls, PrepareButton, SyncNow } from "./PubPlatformControls";

export const metadata = { title: "Pub — Plateforme" };
export const dynamic = "force-dynamic";

const CARD = "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl";
const H2 = "text-xs font-bold uppercase tracking-wider text-gray-500";

// ADR 0086 §2 + « Trace » — l'espace de Mehdi pour la Pub : en tête, les chiffres qui
// doivent rester à zéro ; puis ses deux gestes (virement reçu, lancer / renvoyer), les
// factures à émettre dans Accountable, les campagnes non rattachées, et la page Facebook
// qui signe la pub de chaque client. Maquette validée le 2026-10-23.
export default async function PlatformPubPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  if (!profile?.is_super_admin) redirect("/join?reason=platform-required");

  const [d, ids] = await Promise.all([loadPlatformPub(), metaIdentities()]);
  if (!d.ok) {
    return (
      <div className="space-y-4 max-w-5xl">
        <h1 className="text-2xl font-bold">Pub</h1>
        <p className="text-sm text-gray-500">Tables de la Pub absentes : appliquer les migrations 20261017-1951 et 20261023-1130.</p>
      </div>
    );
  }
  const t = d.trace;
  const today = todayBrussels();
  const tiles: { value: string; label: string; tone?: "warn" | "bad" | "good" }[] = [
    { value: String(t.toConfirm), label: "virement(s) à confirmer", tone: t.paymentsLate ? "warn" : undefined },
    { value: String(t.toLaunch), label: "campagne(s) à lancer" },
    { value: String(t.invoicesToIssue), label: "facture(s) à émettre", tone: t.invoicesMissing48h ? "bad" : t.invoicesToIssue ? "warn" : undefined },
    { value: formatEur(t.unattachedSpend7dCents), label: "dépense non rattachée (7 j)", tone: t.unattachedSpend7dCents ? "bad" : undefined },
    { value: String(t.activeWithoutCap + t.capOverPaid), label: "plafond absent ou > payé", tone: t.activeWithoutCap + t.capOverPaid ? "bad" : undefined },
    { value: String(t.disapproved), label: "pub(s) refusée(s) par Meta", tone: t.disapproved ? "bad" : undefined },
    { value: String(t.apiFailures24h), label: "appel(s) Meta en échec (24 h)", tone: t.apiFailures24h ? "warn" : undefined },
    { value: t.medianPaidToLaunchHours === null ? "—" : `${t.medianPaidToLaunchHours} h`, label: "payé → lancé (médiane, cible < 24 h)" },
    {
      value: t.lastRun ? `${t.lastRun.ok ? "OK" : "Échec"} · ${new Date(t.lastRun.at).toLocaleString("fr-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : "jamais",
      label: t.lastRun ? `lecture Meta (${t.lastRun.read} lues, ${t.lastRun.errors} erreur(s))` : "lecture Meta",
      tone: t.lastRun?.ok ? "good" : "bad",
    },
    { value: String(t.alertMailsFailed7d), label: "e-mail(s) d'alerte en échec (7 j)", tone: t.alertMailsFailed7d ? "bad" : undefined },
  ];
  const toneCls = { warn: "border-amber-500 text-amber-700", bad: "border-red-600 text-red-700", good: "text-emerald-700" } as const;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Pub</h1>
          <p className="text-sm text-gray-500 mt-1">Un compte Meta Boosteats pour tous les clients ; virement → campagne en pause → tu lances.</p>
        </div>
        <SyncNow />
      </div>
      {d.missing.length > 0 && <p className="rounded-xl border border-amber-500 p-3 text-sm text-amber-800">Configuration manquante : {d.missing.join(", ")}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {tiles.map((x) => (
          <div key={x.label} className={`${CARD} p-3 ${x.tone ? toneCls[x.tone].split(" ")[0] : ""}`}>
            <p className={`text-lg font-bold tabular-nums ${x.tone ? (toneCls[x.tone].split(" ")[1] ?? "") : ""}`}>{x.value}</p>
            <p className="text-xs text-gray-500">{x.label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className={`${CARD} p-4 space-y-3`}>
          <h2 className={H2}>1 · Virements attendus</h2>
          {d.notices.length === 0 && <p className="text-sm text-gray-500">Aucun.</p>}
          {d.notices.map((n) => (
            <div key={n.id} className="rounded-xl border border-gray-200 dark:border-gray-800 p-3 space-y-2">
              <div className="flex justify-between text-sm"><strong>{n.clientCode} · {n.restaurantName}</strong><span className="tabular-nums">{formatEur(n.expectedCents)}</span></div>
              <p className="font-mono text-sm">{n.ref}</p>
              <p className="text-xs text-gray-500">
                {n.kind === "recharge" ? "Complément" : n.objective} · budget {formatEur(n.budgetCents)} + frais {formatEur(n.feeCents)} · demandé le {new Date(n.createdAt).toLocaleDateString("fr-BE")}
              </p>
              <ConfirmPayment noticeId={n.id} expectedEuros={(n.expectedCents / 100).toFixed(2)} today={today} />
              <p className="text-xs text-gray-500">→ crédite le budget, prépare la facture, {n.kind === "recharge" ? "relève le plafond chez Meta" : "crée la campagne en pause chez Meta"}.</p>
            </div>
          ))}
        </section>

        <section className={`${CARD} p-4 space-y-3`}>
          <h2 className={H2}>2 · À lancer</h2>
          {d.toLaunch.length === 0 && d.stuck.length === 0 && <p className="text-sm text-gray-500">Rien à lancer.</p>}
          {d.toLaunch.map((c) => {
            const src = c.preview?.match(/src="([^"]+)"/)?.[1]?.replace(/&amp;/g, "&") ?? null;
            return (
              <div key={c.requestId} className="rounded-xl border border-gray-200 dark:border-gray-800 p-3 flex gap-3">
                {src ? <iframe src={src} title="Aperçu Meta" className="h-[420px] w-[260px] shrink-0 rounded-lg border-0" /> : <div className="h-32 w-24 shrink-0 rounded-lg bg-gray-100 dark:bg-gray-800 text-xs flex items-center justify-center">Aperçu indisponible</div>}
                <div className="min-w-0 space-y-1 text-sm">
                  <p className="font-semibold break-all">{c.campaignName ?? c.restaurantName}</p>
                  <p className="text-gray-600 dark:text-gray-400">{c.objective}</p>
                  <p className="text-gray-600 dark:text-gray-400">{c.radiusKm} km · tous âges · {c.startsOn} → {c.endsOn}</p>
                  <p className="text-gray-600 dark:text-gray-400">{c.dailyCents !== null ? `${formatEur(c.dailyCents)}/jour · ` : ""}plafond {c.capCents !== null ? formatEur(c.capCents) : "—"} · payé {formatEur(c.paidCents)}</p>
                  {c.adText && <p className="text-gray-600 dark:text-gray-400 italic">« {c.adText} »</p>}
                  <p className="text-xs text-gray-500">Bénéficiaire {c.restaurantName} · payeur Boosteats{c.adStatus ? ` · Meta : ${c.adStatus}` : ""}</p>
                  {c.capCents !== null && c.capCents > c.paidCents && <p className="text-xs text-red-700">Plafond au-dessus du payé : ne lance pas.</p>}
                  <LaunchControls requestId={c.requestId} canLaunch={c.capCents !== null && c.capCents <= c.paidCents} />
                </div>
              </div>
            );
          })}
          {d.stuck.map((s) => (
            <div key={s.requestId} className="rounded-xl border border-amber-400 p-3 text-sm space-y-2">
              <p><strong>{s.restaurantName}</strong> · {s.objective} · {s.status === "payee" ? "payée, pas encore créée chez Meta" : "renvoyée, en attente de la retouche"}</p>
              {s.status === "payee" && <PrepareButton requestId={s.requestId} />}
            </div>
          ))}
        </section>

        <section className={`${CARD} p-4 space-y-3`}>
          <h2 className={H2}>3 · Factures à émettre dans Accountable</h2>
          {d.invoices.length === 0 && <p className="text-sm text-gray-500">Aucune.</p>}
          {d.invoices.map((i) => (
            <div key={i.id} className="rounded-xl border border-gray-200 dark:border-gray-800 p-3 space-y-1 text-sm">
              <p className="font-semibold">{i.legalName ?? i.restaurantName} · {i.vat ?? "sans TVA"}</p>
              <p className="text-gray-600 dark:text-gray-400">{i.address ?? "adresse manquante"}</p>
              <p>Campagne publicitaire {i.clientCode} — budget de diffusion · {formatEur(i.budgetCents)}</p>
              <p>Frais de service · {formatEur(i.feeCents)}</p>
              <p className="text-gray-500">{i.vatCents ? `TVA ${formatEur(i.vatCents)}` : "Régime particulier de la franchise de taxe"} · total {formatEur(i.expectedCents)} · reçu {i.receivedCents !== null ? formatEur(i.receivedCents) : "—"} le {i.receivedOn ?? "—"} · {i.ref}</p>
              <InvoiceForm noticeId={i.id} />
            </div>
          ))}
        </section>

        <section className={`${CARD} p-4 space-y-3 ${d.unattached.some((u) => u.spend7dCents > 0) ? "border-red-600" : ""}`}>
          <h2 className={H2}>4 · Campagnes non rattachées</h2>
          {d.unattached.length === 0 && <p className="text-sm text-gray-500">Aucune.</p>}
          {d.unattached.map((u) => (
            <div key={u.id} className="rounded-xl border border-gray-200 dark:border-gray-800 p-3 space-y-2 text-sm">
              <p className="font-semibold break-all">{u.name}</p>
              <p className="text-gray-600 dark:text-gray-400">{u.problem ?? "?"} · {formatEur(u.spend7dCents)} dépensés sur 7 jours</p>
              <AttachForm campaignId={u.id} restaurants={d.restaurants} />
            </div>
          ))}
        </section>
      </div>

      <section className={`${CARD} p-4 space-y-3`}>
        <h2 className={H2}>Qui signe la pub de chaque client</h2>
        <p className="text-xs text-gray-500">La page Facebook (partagée en partenaire au portefeuille Boosteats) et le compte Instagram du restaurant. Sans page, aucune campagne ne se prépare.</p>
        {d.restaurants.map((r) => (
          <div key={r.id} className="grid gap-2 sm:grid-cols-[220px_1fr] items-center text-sm">
            <span><strong>{r.clientCode}</strong> · {r.name}</span>
            <IdentityForm restaurantId={r.id} pages={ids.pages} instagram={ids.instagram} currentPage={r.pageName} currentIg={r.igUsername} />
          </div>
        ))}
      </section>

      <section className={`${CARD} p-4 space-y-2 overflow-x-auto`}>
        <h2 className={H2}>Toutes les campagnes</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-gray-500">
            <tr><th className="py-1 pr-3">Campagne</th><th className="pr-3">Client</th><th className="pr-3">État</th><th className="pr-3">Payé</th><th className="pr-3">Dépensé</th><th className="pr-3">Plafond</th><th className="pr-3">Résultat</th><th>Signalements</th></tr>
          </thead>
          <tbody>
            {d.campaigns.map((c) => (
              <tr key={c.id} className="border-t border-gray-200 dark:border-gray-800">
                <td className="py-1.5 pr-3 break-all">{c.name}</td>
                <td className="pr-3">{c.restaurantName ?? <span className="text-red-700">non rattachée</span>}</td>
                <td className="pr-3">{c.status ?? "—"}{c.adStatus === "DISAPPROVED" ? <span className="text-red-700"> · refusée</span> : null}</td>
                <td className="pr-3 tabular-nums">{c.paidCents === null ? "—" : formatEur(c.paidCents)}</td>
                <td className="pr-3 tabular-nums">{formatEur(c.spentCents)}</td>
                <td className={`pr-3 tabular-nums ${c.paidCents !== null && (c.capCents ?? 0) > c.paidCents ? "text-red-700" : ""}`}>{c.capCents === null ? "aucun" : formatEur(c.capCents)}</td>
                <td className="pr-3 tabular-nums">{c.results} {c.resultKind ?? ""}</td>
                <td className="text-xs text-gray-500">{c.warnings.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {d.failures.length > 0 && (
        <section className={`${CARD} p-4 space-y-2`}>
          <h2 className={H2}>Derniers appels Meta en échec</h2>
          {d.failures.map((f, i) => (
            <p key={i} className="text-xs font-mono break-all"><span className="text-gray-500">{new Date(f.at).toLocaleString("fr-BE", { timeZone: "Europe/Brussels" })}</span> {f.path} — {f.error}</p>
          ))}
        </section>
      )}
    </div>
  );
}
