import { createAdminClient } from "../supabase";
import { alertPlatform, notifyRestaurant } from "./alerts";
import { formatEur } from "./money";
import { listRequests } from "./requests";
import type { SyncSummary } from "./sync";

// ADR 0085 §5 + ADR 0086 §4 et Conséquences — les garde-fous, après la lecture du matin.
// Chacun produit un CHIFFRE (affiché en tête de /platform/pub par lib/ads/platform.ts)
// et, s'il n'est pas à zéro, un e-mail (une fois par jour au plus).

const DAY = 86_400_000;

export type GuardsSummary = { alerts: string[] };

export async function runAdsGuards(sync: SyncSummary, now: Date = new Date()): Promise<GuardsSummary> {
  const db = createAdminClient();
  const alerts: string[] = [];
  const push = (k: string) => alerts.push(k);

  if (!sync.ok) {
    await alertPlatform("sync_failed", "account", { subject: "Pub — lecture Meta en échec", title: "La lecture du matin a échoué", lines: sync.errors.map((e) => `${e.step} : ${e.message}`) });
    push("sync_failed");
  }

  // Campagnes non rattachées qui dépensent : l'argent que personne ne refacturera.
  const since7 = new Date(now.getTime() - 7 * DAY).toISOString().slice(0, 10);
  const un = await db.from("ad_campaigns").select("id, name, attach_problem").is("restaurant_id", null);
  const unRows = (un.data ?? []) as { id: string; name: string; attach_problem: string | null }[];
  if (unRows.length) {
    const st = await db.from("ad_daily_stats").select("campaign_id, spend_cents").in("campaign_id", unRows.map((c) => c.id)).gte("day", since7);
    const spend = ((st.data ?? []) as { campaign_id: string; spend_cents: number }[]).reduce((n, s) => n + s.spend_cents, 0);
    if (spend > 0) {
      await alertPlatform("unattached_spend", "account", { subject: `Pub — ${formatEur(spend)} dépensés sans client (7 jours)`, title: "Dépense non rattachée", lines: ["Des campagnes dépensent sans être rattachées à un client : rattache-les sur /platform/pub."], rows: unRows.map((c) => [c.name, c.attach_problem ?? "?"]) });
      push("unattached_spend");
    }
  }

  // Campagnes actives sans plafond, et plafond ≠ total payé.
  const act = await db.from("ad_campaigns").select("id, name, request_id, spend_cap_cents, effective_status").eq("effective_status", "ACTIVE");
  const actRows = (act.data ?? []) as { id: string; name: string; request_id: string | null; spend_cap_cents: number | null }[];
  const noCap = actRows.filter((c) => !c.spend_cap_cents);
  if (noCap.length) {
    await alertPlatform("no_cap", "account", { subject: `Pub — ${noCap.length} campagne(s) active(s) sans plafond`, title: "Campagne active sans plafond", lines: ["Sans plafond, une campagne peut dépenser l'argent des autres clients (compte commun)."], rows: noCap.map((c) => [c.name, "aucun plafond"]) });
    push("no_cap");
  }
  const withReq = actRows.filter((c) => c.request_id && c.spend_cap_cents);
  if (withReq.length) {
    const cr = await db.from("ad_credit_transactions").select("request_id, amount_cents").in("request_id", withReq.map((c) => c.request_id as string));
    const paid = new Map<string, number>();
    for (const t of (cr.data ?? []) as { request_id: string; amount_cents: number }[]) paid.set(t.request_id, (paid.get(t.request_id) ?? 0) + t.amount_cents);
    const off = withReq.filter((c) => (c.spend_cap_cents ?? 0) > (paid.get(c.request_id as string) ?? 0));
    if (off.length) {
      await alertPlatform("cap_over_paid", "account", { subject: "Pub — plafond Meta au-dessus du payé", title: "Plafond au-dessus de ce qui a été payé", lines: ["Le plafond d'une campagne dépasse le total payé par le client : remets-le au payé."], rows: off.map((c) => [c.name, `plafond ${formatEur(c.spend_cap_cents ?? 0)} / payé ${formatEur(paid.get(c.request_id as string) ?? 0)}`]) });
      push("cap_over_paid");
    }
  }

  // Publicités refusées par Meta.
  for (const d of sync.disapproved) {
    await alertPlatform("disapproved", d.campaignId, { subject: `Pub — publicité refusée par Meta : ${d.name}`, title: "Publicité refusée par Meta", lines: ["Renvoie-la au restaurateur avec le motif, ou corrige-la dans le Gestionnaire."], rows: [["Motif Meta", JSON.stringify(d.feedback ?? {})]] });
    push("disapproved");
  }

  // Appels Meta en échec sur 24 h.
  const failed = await db.from("ad_api_calls").select("path, error").eq("ok", false).gte("at", new Date(now.getTime() - DAY).toISOString()).limit(20);
  const fRows = (failed.data ?? []) as { path: string; error: string | null }[];
  if (fRows.length) {
    await alertPlatform("api_failed_daily", "account", { subject: `Pub — ${fRows.length} appel(s) Meta en échec (24 h)`, title: "Appels Meta en échec", lines: ["Le journal complet est en bas de /platform/pub."], rows: fRows.map((f) => [f.path, f.error ?? "?"]) });
    push("api_failed");
  }

  // Virements attendus depuis plus de 7 jours ; confirmés sans facture depuis plus de 48 h.
  const late = await db.from("ad_payment_notices").select("id, structured_ref, expected_cents").is("confirmed_at", null).lt("created_at", new Date(now.getTime() - 7 * DAY).toISOString());
  const lateRows = (late.data ?? []) as { id: string; structured_ref: string; expected_cents: number }[];
  if (lateRows.length) {
    await alertPlatform("payment_late", "account", { subject: `Pub — ${lateRows.length} virement(s) attendu(s) depuis plus de 7 jours`, title: "Virements en retard", lines: ["Relance le restaurateur ou annule la demande."], rows: lateRows.map((n) => [n.structured_ref, formatEur(n.expected_cents)]) });
    push("payment_late");
  }
  const noInv = await db.from("ad_payment_notices").select("id, structured_ref, expected_cents").not("confirmed_at", "is", null).is("invoice_number", null).lt("confirmed_at", new Date(now.getTime() - 2 * DAY).toISOString());
  const noInvRows = (noInv.data ?? []) as { id: string; structured_ref: string; expected_cents: number }[];
  if (noInvRows.length) {
    await alertPlatform("invoice_missing", "account", { subject: `Pub — ${noInvRows.length} paiement(s) sans facture depuis 48 h`, title: "Factures à émettre", lines: ["Émets-les dans Accountable et reporte le numéro sur /platform/pub."], rows: noInvRows.map((n) => [n.structured_ref, formatEur(n.expected_cents)]) });
    push("invoice_missing");
  }

  // Côté restaurateur : budget bientôt épuisé, pub terminée.
  const live = await db.from("ad_requests").select("restaurant_id").in("status", ["en_diffusion", "terminee"]);
  const restaurants = [...new Set(((live.data ?? []) as { restaurant_id: string }[]).map((r) => r.restaurant_id))];
  for (const rid of restaurants) {
    const l = await listRequests(rid);
    if (!l.ok) continue;
    const { data: rest } = await db.from("restaurants").select("name").eq("id", rid).single();
    const name = (rest as { name: string } | null)?.name ?? rid;
    for (const q of l.requests) {
      const raw = await db.from("ad_requests").select("requested_by").eq("id", q.id).single();
      const by = (raw.data as { requested_by: string | null } | null)?.requested_by ?? null;
      if (q.lowCredit) {
        await notifyRestaurant("low_credit", `${q.id}-${q.paidCents}`, { restaurantId: rid, restaurantName: name, requestedBy: by }, {
          subject: `${name} — ta pub s'arrête bientôt`,
          title: "Moins de 2 jours de budget",
          intro: `Il reste ${formatEur(Math.max(0, q.paidCents - q.spentCents))} : au rythme actuel, ta pub s'arrête d'ici ${Math.max(1, Math.round(q.daysLeft ?? 1))} jour(s). Ajoute du budget pour qu'elle continue.`,
          rows: [[q.resultLabel, String(q.results)], ["Dépensé", formatEur(q.spentCents)]],
        });
      }
      if (q.status === "terminee" && sync.ended.includes(q.id)) {
        await notifyRestaurant("ended", q.id, { restaurantId: rid, restaurantName: name, requestedBy: by }, {
          subject: `${name} — ta pub est terminée`,
          title: "Ta pub est terminée",
          intro: "Tout le budget a été diffusé. Voici ce qu'elle a donné.",
          rows: [[q.resultLabel, String(q.results)], ["Personnes touchées", String(q.reach)], ["Dépensé", formatEur(q.spentCents)]],
          note: "Tu peux la relancer en un geste depuis ta console.",
        });
      }
    }
  }

  return { alerts };
}
