import { createAdminClient } from "./supabase";
import { isMissingTable } from "./audit/store";
import { isPurgeable, purgeCutoff, type PurgeMission, type PurgeReport } from "./mission-purge";

// ============================================================
// Réserver un prestataire (ADR 0084 §5 quaterdecies) — le rapport de purge, EN LECTURE SEULE.
//
// Aucune écriture, aucune suppression : ce fichier ne contient aucun `.delete()`, `.update()` ni `.remove()` (un test le vérifie).
// Une catégorie dont la table manque est comptée à zéro et nommée dans `unavailable` : jamais un silence.
// ============================================================

type Row = PurgeMission & { id: string; brief: Record<string, unknown> | null };
const PAGE = 1000;
const IN_CHUNK = 200;

export async function purgeReport(now = new Date()): Promise<PurgeReport> {
  const db = createAdminClient();
  const cutoff = purgeCutoff(now);
  const report: PurgeReport = { dryRun: true, cutoff: cutoff.toISOString(), missions: 0, messages: 0, attachments: 0, attachmentBytes: 0, deliveries: 0, proofs: 0, briefContacts: 0, unavailable: [] };

  // Les missions finies depuis assez longtemps (le tri fin se fait ici, avec les mêmes règles que les tests).
  const ids: string[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("missions")
      .select("id, status, validated_at, cancelled_at, updated_at, brief")
      .in("status", ["verse", "annule"])
      .lte("updated_at", cutoff.toISOString())
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) {
      if (isMissingTable(error)) report.unavailable.push("missions");
      else console.error("[purge-missions] lecture des missions impossible:", error.message);
      return report;
    }
    const rows = (data ?? []) as Row[];
    for (const r of rows) {
      if (!isPurgeable(r, now)) continue;
      ids.push(r.id);
      const contact = r.brief?.contact as { name?: string; phone?: string } | undefined;
      if (contact && (contact.name || contact.phone)) report.briefContacts++;
    }
    if (rows.length < PAGE) break;
  }
  report.missions = ids.length;

  async function count(table: "mission_messages" | "mission_deliveries" | "mission_proofs"): Promise<number> {
    let n = 0;
    for (let i = 0; i < ids.length; i += IN_CHUNK) {
      const { count: c, error } = await db.from(table).select("id", { count: "exact", head: true }).in("mission_id", ids.slice(i, i + IN_CHUNK));
      if (error) {
        if (isMissingTable(error)) report.unavailable.push(table);
        else console.error(`[purge-missions] ${table}:`, error.message);
        return 0;
      }
      n += c ?? 0;
    }
    return n;
  }
  report.messages = await count("mission_messages");
  report.deliveries = await count("mission_deliveries");
  report.proofs = await count("mission_proofs");

  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const { data, error } = await db.from("mission_attachments").select("size_bytes").in("mission_id", ids.slice(i, i + IN_CHUNK));
    if (error) {
      if (isMissingTable(error)) report.unavailable.push("mission_attachments");
      else console.error("[purge-missions] mission_attachments:", error.message);
      break;
    }
    for (const a of (data ?? []) as { size_bytes: number }[]) {
      report.attachments++;
      report.attachmentBytes += Number(a.size_bytes) || 0;
    }
  }

  console.info("[purge-missions] à blanc", JSON.stringify(report));
  return report;
}
