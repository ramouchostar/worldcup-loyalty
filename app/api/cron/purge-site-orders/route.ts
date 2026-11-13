import { NextResponse } from "next/server";
import { supabasePurgeDb } from "@/lib/site-orders/purge-db";
import { runPurge } from "@/lib/site-orders/purge";

// ADR 0099 §7 — chaque nuit, le prénom et le téléphone des commandes du site plus vieilles que la durée de conservation
// (30 jours, SITE_ORDER_PURGE_DAYS entre 7 et 365) sont EFFACÉS. La commande (plats, prix, numéro) reste : c'est une vente.
// `?dry=1` compte sans rien effacer. Le résultat dit combien de commandes étaient concernées et combien ont été effacées ;
// une panne répond 503 (Vercel la montre), jamais un échec silencieux.

export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  const dryRun = new URL(request.url).searchParams.get("dry") === "1";
  try {
    const report = await runPurge(supabasePurgeDb(), new Date(), process.env.SITE_ORDER_PURGE_DAYS, dryRun);
    console.info(`[purge-site-orders] jours=${report.days} a_blanc=${report.dryRun} concernees=${report.candidates} effacees=${report.erased} indisponible=${report.unavailable} reglage_illisible=${report.invalidSetting}`);
    return NextResponse.json(report);
  } catch (e) {
    console.error("[purge-site-orders]", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Erreur serveur." }, { status: 503 });
  }
}
