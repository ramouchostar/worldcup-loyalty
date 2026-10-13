import { createAdminClient } from "./supabase";
import { isMissingTable } from "./audit/store";
import { todayInBrussels } from "./qr-funnel";
import { getMission, logEvent, type MissionRow } from "./missions";
import { getForProvider } from "./provider-missions";
import type { ProviderRow } from "./providers";
import { retouchState } from "./mission-retouch";
import { judgeSubmit } from "./mission-proposals";
import { judgeChangeRequest } from "./mission-changes";
import { listChanges } from "./missions-changes-state";
import { loadProposalState, rulesState } from "./missions-proposals-state";
import {
  FILE_SCOPES,
  MAX_FILE_BYTES,
  MAX_MISSION_BYTES,
  MAX_UNLINKED,
  SCOPE_ACTOR,
  extensionOf,
  familyOf,
  judgeContent,
  judgeUploadRequest,
  storagePath,
  type AttachmentView,
  type FileIssue,
  type FileScope,
} from "./mission-files";

// ============================================================
// Réserver un prestataire (ADR 0084 §3 règle 7, PR L) — les pièces jointes : demander un envoi, le confirmer, le retirer,
// le télécharger.
//
// Le fichier ne passe PAS par nos fonctions (limite de 4,5 Mo des fonctions Vercel) : le navigateur l'envoie directement
// dans l'espace privé avec un lien signé. Le serveur juge ensuite le CONTENU RÉEL (premiers octets) avant de le déclarer
// utilisable : un fichier non confirmé n'est jamais visible, et le cron le supprime au bout d'un jour. Fail-open :
// migration 20261013-1300 absente → « unavailable », rien n'est écrit à moitié.
// ============================================================

export const FILES_BUCKET = "mission-files";

type DbError = { code?: string; message?: string } | null;
const unavailable = { ok: false, reason: "unavailable" } as const;

export type FileActor = { kind: "restaurant"; restaurantId: string; userId: string } | { kind: "provider"; provider: ProviderRow };

type Ctx = Pick<MissionRow, "id" | "status" | "shoot_date" | "retouch_rounds_used" | "restaurant_id" | "provider_id">;

/** La mission, vue par CET acteur : le restaurateur de l'établissement ou le prestataire de la mission, jamais un autre. */
async function contextOf(actor: FileActor, missionId: string): Promise<{ ok: true; mission: Ctx | null } | typeof unavailable> {
  if (actor.kind === "restaurant") {
    const f = await getMission(missionId, actor.restaurantId);
    return f.ok ? { ok: true, mission: f.mission } : unavailable;
  }
  const f = await getForProvider(missionId, actor.provider.id);
  return f.ok ? { ok: true, mission: f.mission } : unavailable;
}

const actorId = (a: FileActor) => (a.kind === "restaurant" ? a.userId : (a.provider.user_id ?? undefined));

/** Peut-on encore déposer dans cette portée, et sous quelle référence ? */
async function openScope(scope: FileScope, m: Ctx): Promise<{ open: boolean; ref: string | null }> {
  if (scope === "brief") return { open: m.status === "brief", ref: null };
  if (scope === "retouch") {
    const s = retouchState(m.status, m.retouch_rounds_used);
    return s.can ? { open: true, ref: `round-${s.round}` } : { open: false, ref: null };
  }
  if (scope === "change") {
    const c = await listChanges(m.id);
    return { open: c.ok && judgeChangeRequest({ status: m.status, shootDate: m.shoot_date, changes: c.changes }, todayInBrussels()) === "ok", ref: null };
  }
  const p = await loadProposalState(m.id);
  if (!p.ok) return { open: false, ref: null };
  return { open: judgeSubmit(rulesState(m, p.state), todayInBrussels()) === "ok", ref: null };
}

// ── Demander un envoi ────────────────────────────────────────

export type RequestResult =
  | { ok: true; id: string; uploadUrl: string; name: string }
  | { ok: false; reason: "not_found" | "unavailable" }
  | { ok: false; reason: "refused"; issue: FileIssue };

export async function requestUpload(actor: FileActor, missionId: string, raw: unknown): Promise<RequestResult> {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const scope = FILE_SCOPES.find((s) => s === o.scope);
  const ctx = await contextOf(actor, missionId);
  if (!ctx.ok) return unavailable;
  if (!ctx.mission) return { ok: false, reason: "not_found" };
  const m = ctx.mission;
  const refuse = async (issue: FileIssue, meta: Record<string, unknown> = {}) => {
    await logEvent(missionId, { kind: "file_refused", actorKind: actor.kind, actorId: actorId(actor), reason: issue, meta: { scope: scope ?? null, ...meta } });
    return { ok: false, reason: "refused", issue } as const;
  };
  if (!scope || SCOPE_ACTOR[scope] !== actor.kind) return refuse("wrong_actor");

  const judged = judgeUploadRequest({ name: String(o.name ?? ""), size: Number(o.size), type: String(o.type ?? "") });
  if (!judged.ok) return refuse(judged.issue, { name: String(o.name ?? "").slice(0, 120), size: Number(o.size) || 0 });

  const gate = await openScope(scope, m);
  if (!gate.open) return refuse("not_now");

  try {
    const admin = createAdminClient();
    const { data: rows, error } = await admin.from("mission_attachments").select("scope, ref, size_bytes").eq("mission_id", missionId);
    if (error) throw error;
    const all = (rows ?? []) as { scope: string; ref: string | null; size_bytes: number }[];
    if (all.reduce((n, r) => n + r.size_bytes, 0) + Number(o.size) > MAX_MISSION_BYTES) return refuse("mission_full");
    if (all.filter((r) => r.scope === scope && r.ref === null).length >= MAX_UNLINKED[scope]) return refuse("too_many");

    const id = crypto.randomUUID();
    const path = storagePath(missionId, scope, id, judged.ext);
    const { error: e1 } = await admin.from("mission_attachments").insert({
      id,
      mission_id: missionId,
      scope,
      ref: null,
      uploaded_by: actor.kind,
      uploader_id: actorId(actor) ?? null,
      name: judged.name,
      storage_path: path,
      mime: String(o.type ?? "").slice(0, 100) || null,
      size_bytes: Math.round(Number(o.size)),
    });
    if (e1) throw e1;
    const signed = await admin.storage.from(FILES_BUCKET).createSignedUploadUrl(path);
    if (signed.error || !signed.data) {
      await admin.from("mission_attachments").delete().eq("id", id);
      throw signed.error ?? new Error("lien d'envoi indisponible");
    }
    return { ok: true, id, uploadUrl: signed.data.signedUrl, name: judged.name };
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-files] requestUpload failed:", (e as Error).message);
    return unavailable;
  }
}

// ── Confirmer : le contenu réel est jugé ─────────────────────

export type ConfirmResult =
  | { ok: true; file: AttachmentView }
  | { ok: false; reason: "not_found" | "not_uploaded" | "unavailable" }
  | { ok: false; reason: "refused"; issue: FileIssue };

type Row = { id: string; mission_id: string; scope: FileScope; ref: string | null; uploaded_by: string; name: string; storage_path: string; size_bytes: number; confirmed_at: string | null };
const ROW_COLUMNS = "id, mission_id, scope, ref, uploaded_by, name, storage_path, size_bytes, confirmed_at";

export async function confirmUpload(actor: FileActor, missionId: string, fileId: string): Promise<ConfirmResult> {
  const ctx = await contextOf(actor, missionId);
  if (!ctx.ok) return unavailable;
  if (!ctx.mission) return { ok: false, reason: "not_found" };
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("mission_attachments").select(ROW_COLUMNS).eq("id", fileId).eq("mission_id", missionId).eq("uploaded_by", actor.kind).maybeSingle();
    if (error) throw error;
    const row = data as Row | null;
    if (!row) return { ok: false, reason: "not_found" };
    const view = { id: row.id, name: row.name, size: row.size_bytes, family: familyOf(row.name) };
    if (row.confirmed_at) return { ok: true, file: view }; // idempotent

    const ext = extensionOf(row.name);
    const signed = await admin.storage.from(FILES_BUCKET).createSignedUrl(row.storage_path, 60);
    if (signed.error || !signed.data) return { ok: false, reason: "not_uploaded" };
    const isSvg = ext === "svg";
    const res = await fetch(signed.data.signedUrl, isSvg ? undefined : { headers: { Range: "bytes=0-4095" } });
    if (res.status === 404 || res.status === 400) return { ok: false, reason: "not_uploaded" };
    if (!res.ok) throw new Error(`lecture du fichier impossible (${res.status})`);

    const buf = new Uint8Array(await res.arrayBuffer());
    const range = /\/(\d+)$/.exec(res.headers.get("content-range") ?? "");
    const total = range ? Number(range[1]) : res.status === 200 ? buf.byteLength : Number(res.headers.get("content-length") ?? buf.byteLength);

    const reject = async (issue: FileIssue) => {
      await admin.storage.from(FILES_BUCKET).remove([row.storage_path]);
      await admin.from("mission_attachments").delete().eq("id", row.id);
      await logEvent(missionId, { kind: "file_refused", actorKind: actor.kind, actorId: actorId(actor), reason: issue, meta: { scope: row.scope, ext, stage: "content" } });
      return { ok: false, reason: "refused", issue } as const;
    };
    if (!Number.isFinite(total) || total <= 0) return reject("empty");
    if (total > MAX_FILE_BYTES) return reject("too_big");
    const verdict = judgeContent(ext, buf.slice(0, 4096), isSvg ? new TextDecoder().decode(buf) : undefined);
    if (!verdict.ok) return reject(verdict.issue);

    const { error: e2 } = await admin.from("mission_attachments").update({ confirmed_at: new Date().toISOString(), size_bytes: total }).eq("id", row.id).is("confirmed_at", null);
    if (e2) throw e2;
    await logEvent(missionId, { kind: "file_uploaded", actorKind: actor.kind, actorId: actorId(actor), meta: { scope: row.scope, ext, size: total } });
    return { ok: true, file: { ...view, size: total } };
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-files] confirmUpload failed:", (e as Error).message);
    return unavailable;
  }
}

// ── Retirer (tant que la portée est ouverte et le fichier non rattaché) ──

export type RemoveResult = { ok: true } | { ok: false; reason: "not_found" | "locked" | "unavailable" };

export async function removeFile(actor: FileActor, missionId: string, fileId: string): Promise<RemoveResult> {
  const ctx = await contextOf(actor, missionId);
  if (!ctx.ok) return unavailable;
  if (!ctx.mission) return { ok: false, reason: "not_found" };
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("mission_attachments").select(ROW_COLUMNS).eq("id", fileId).eq("mission_id", missionId).eq("uploaded_by", actor.kind).maybeSingle();
    if (error) throw error;
    const row = data as Row | null;
    if (!row) return { ok: false, reason: "not_found" };
    // Un fichier rattaché (idée, retouche envoyée) ou une portée fermée (brief verrouillé) ne se retire plus.
    if (row.ref !== null || !(await openScope(row.scope, ctx.mission)).open) return { ok: false, reason: "locked" };
    await admin.storage.from(FILES_BUCKET).remove([row.storage_path]);
    const { error: e2 } = await admin.from("mission_attachments").delete().eq("id", row.id).is("ref", null);
    if (e2) throw e2;
    await logEvent(missionId, { kind: "file_removed", actorKind: actor.kind, actorId: actorId(actor), meta: { scope: row.scope } });
    return { ok: true };
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-files] removeFile failed:", (e as Error).message);
    return unavailable;
  }
}

// ── Lire ─────────────────────────────────────────────────────

export type FileRow = AttachmentView & { scope: FileScope; ref: string | null; uploadedBy: "restaurant" | "provider" };

/** Les fichiers CONFIRMÉS d'une mission (jamais un fichier en cours d'envoi). Migration absente → liste vide. */
export async function listFiles(missionId: string, scope?: FileScope): Promise<FileRow[]> {
  try {
    let q = createAdminClient().from("mission_attachments").select("id, scope, ref, uploaded_by, name, size_bytes").eq("mission_id", missionId).not("confirmed_at", "is", null).order("created_at", { ascending: true });
    if (scope) q = q.eq("scope", scope);
    const { data, error } = await q;
    if (error) throw error;
    return ((data ?? []) as { id: string; scope: FileScope; ref: string | null; uploaded_by: "restaurant" | "provider"; name: string; size_bytes: number }[]).map((r) => ({ id: r.id, scope: r.scope, ref: r.ref, uploadedBy: r.uploaded_by, name: r.name, size: r.size_bytes, family: familyOf(r.name) }));
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-files] listFiles failed:", (e as Error).message);
    return [];
  }
}

// ── Télécharger ──────────────────────────────────────────────

export type DownloadResult = { ok: true; url: string } | { ok: false; reason: "not_found" | "unavailable" };

/** Un lien signé de 60 secondes, téléchargement forcé (jamais ouvert dans la page), pour les deux parties de la mission seulement. */
export async function downloadUrl(actor: FileActor, missionId: string, fileId: string): Promise<DownloadResult> {
  const ctx = await contextOf(actor, missionId);
  if (!ctx.ok) return unavailable;
  if (!ctx.mission) return { ok: false, reason: "not_found" };
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("mission_attachments").select(ROW_COLUMNS).eq("id", fileId).eq("mission_id", missionId).not("confirmed_at", "is", null).maybeSingle();
    if (error) throw error;
    const row = data as Row | null;
    if (!row) return { ok: false, reason: "not_found" };
    const signed = await admin.storage.from(FILES_BUCKET).createSignedUrl(row.storage_path, 60, { download: row.name });
    if (signed.error || !signed.data) throw signed.error ?? new Error("lien indisponible");
    return { ok: true, url: signed.data.signedUrl };
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-files] downloadUrl failed:", (e as Error).message);
    return unavailable;
  }
}

// ── Le nettoyage du cron ─────────────────────────────────────

export type FilesCleanup = { ok: false } | { ok: true; unconfirmed: number; orphaned: number };

/**
 * Supprime les envois jamais confirmés (au bout d'un jour) et les pièces d'idée ou de retouche déposées mais jamais
 * rattachées (au bout de trois jours). Les pièces du BRIEF restent avec le brouillon.
 */
export async function cleanupFiles(now: Date = new Date()): Promise<FilesCleanup> {
  try {
    const admin = createAdminClient();
    const day = 24 * 3600 * 1000;
    const sweep = async (rows: { id: string; storage_path: string }[]) => {
      if (rows.length === 0) return 0;
      await admin.storage.from(FILES_BUCKET).remove(rows.map((r) => r.storage_path));
      const { error } = await admin.from("mission_attachments").delete().in("id", rows.map((r) => r.id));
      if (error) throw error;
      return rows.length;
    };
    const { data: a, error: e1 } = await admin.from("mission_attachments").select("id, storage_path").is("confirmed_at", null).lt("created_at", new Date(now.getTime() - day).toISOString()).limit(200);
    if (e1) throw e1;
    const unconfirmed = await sweep((a ?? []) as { id: string; storage_path: string }[]);
    const { data: b, error: e2 } = await admin.from("mission_attachments").select("id, storage_path").in("scope", ["proposal", "retouch"]).is("ref", null).lt("created_at", new Date(now.getTime() - 3 * day).toISOString()).limit(200);
    if (e2) throw e2;
    const orphaned = await sweep((b ?? []) as { id: string; storage_path: string }[]);
    return { ok: true, unconfirmed, orphaned };
  } catch (e) {
    if (!isMissingTable(e as DbError)) console.error("[missions-files] cleanup failed:", (e as Error).message);
    return { ok: false };
  }
}
