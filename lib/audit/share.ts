// ADR 0069 §6 — version finale figée et lien partagé au gérant.
// SERVEUR UNIQUEMENT (service role) : tables en RLS sans policy.
//
// Le lien : boosteats.tech/audit/<nom-du-restaurant>/v<N>-<jeton>.
// - Le nom est lisible (le gérant reconnaît son restaurant dans WhatsApp) mais
//   ne sert à rien pour ouvrir : seul le jeton compte (un mauvais nom redirige
//   vers le bon).
// - Le jeton (128 bits) est dérivé du lien par HMAC avec un secret serveur :
//   seule son empreinte sha256 est stockée (`token_hash`), et la console peut
//   quand même réafficher le lien sans le garder en clair.
// - Le rapport contient les chiffres du gérant (CA, marges) : le lien expire
//   au bout de 90 jours et se révoque depuis la console.

import { createHash, createHmac } from "node:crypto";
import { createAdminClient } from "@/lib/supabase";
import { isMissingTable, type AuditRow, type SectionRow } from "./store";

export const SHARE_DAYS = 90;

/**
 * Le lien envoyé au gérant est toujours sur boosteats.tech, quel que soit
 * NEXT_PUBLIC_APP_URL (encore l'adresse vercel.app en production le
 * 2026-09-26) : c'est notre marque qu'il doit reconnaître dans WhatsApp.
 */
export const SHARE_ORIGIN = "https://boosteats.tech";

export interface Snapshot {
  v: 1;
  audit: Omit<AuditRow, "cost_usd" | "calls" | "created_by">;
  sections: Pick<SectionRow, "section" | "status" | "result" | "raw">[];
}

export interface ShareRow {
  id: string;
  version_id: string;
  expires_at: string;
  revoked_at: string | null;
  views: number;
  last_viewed_at: string | null;
  created_at: string;
}
export interface VersionRow {
  id: string;
  audit_id: string;
  version: number;
  created_at: string;
}

/** « Krusty Smash Burgers | Uccle » → « krusty-smash-burgers-uccle ». */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/&/g, " et ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/g, "") || "restaurant"
  );
}

function secret(): string {
  const s = process.env.AUDIT_SHARE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("Secret des liens d'audit absent (AUDIT_SHARE_SECRET).");
  return s;
}

/** Jeton du lien : 22 caractères base64url (128 bits), dérivé de l'identifiant du lien. */
export function tokenFor(shareId: string, key = secret()): string {
  return createHmac("sha256", key).update(`audit-share:${shareId}`).digest("base64url").slice(0, 22);
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Le segment « v2-Ab3… » → { version: 2, token: "Ab3…" }. */
export function parseKey(key: string): { version: number; token: string } | null {
  const m = key.match(/^v(\d{1,4})-([A-Za-z0-9_-]{22})$/);
  return m ? { version: Number(m[1]), token: m[2] } : null;
}

export function sharePath(name: string, version: number, token: string): string {
  return `/audit/${slugify(name)}/v${version}-${token}`;
}

/** Ce que le rapport public lit : l'audit sans coûts ni auteur, les volets sans motif d'échec. */
export function snapshotOf(audit: AuditRow, sections: SectionRow[]): Snapshot {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { cost_usd, calls, created_by, ...rest } = audit;
  return {
    v: 1,
    audit: rest,
    sections: sections
      .filter((x) => x.status === "ok")
      .map((x) => ({
        section: x.section,
        status: x.status,
        result: x.result,
        // Seules la fiche (photos, liens) et la liste des avis servent au rendu.
        raw: x.section === "fiche" || x.section === "avis" ? x.raw : null,
      })),
  };
}

/** Fige la version suivante de l'audit et crée son lien. */
export async function freezeAndShare(audit: AuditRow, sections: SectionRow[], userId: string | null): Promise<{ version: number; path: string }> {
  const admin = createAdminClient();
  const { data: last } = await admin
    .from("restaurant_audit_versions")
    .select("version")
    .eq("audit_id", audit.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const version = ((last as { version: number } | null)?.version ?? 0) + 1;
  const { data: v, error: ve } = await admin
    .from("restaurant_audit_versions")
    .insert({ audit_id: audit.id, version, snapshot: snapshotOf(audit, sections), created_by: userId })
    .select("id")
    .single();
  if (ve) throw ve;
  const shareId = crypto.randomUUID();
  const token = tokenFor(shareId);
  const { error: se } = await admin.from("restaurant_audit_shares").insert({
    id: shareId,
    version_id: (v as { id: string }).id,
    token_hash: hashToken(token),
    expires_at: new Date(Date.now() + SHARE_DAYS * 86_400_000).toISOString(),
  });
  if (se) throw se;
  return { version, path: sharePath(audit.name, version, token) };
}

export type SharedAudit =
  | { ok: true; snapshot: Snapshot; version: number; name: string; shareId: string }
  | { ok: false; reason: "introuvable" | "expire" | "revoque" };

/** Ouvre un lien partagé et compte l'ouverture (jamais de pixel, ADR 0063). */
export async function openShared(key: string, count = true): Promise<SharedAudit> {
  const parsed = parseKey(key);
  if (!parsed) return { ok: false, reason: "introuvable" };
  const admin = createAdminClient();
  const { data: share, error } = await admin
    .from("restaurant_audit_shares")
    .select("id, version_id, expires_at, revoked_at, views")
    .eq("token_hash", hashToken(parsed.token))
    .maybeSingle();
  if (isMissingTable(error) || !share) return { ok: false, reason: "introuvable" };
  if (share.revoked_at) return { ok: false, reason: "revoque" };
  if (new Date(share.expires_at).getTime() < Date.now()) return { ok: false, reason: "expire" };
  const { data: ver } = await admin.from("restaurant_audit_versions").select("version, snapshot").eq("id", share.version_id).maybeSingle();
  if (!ver || ver.version !== parsed.version) return { ok: false, reason: "introuvable" };
  if (count) {
    await admin
      .from("restaurant_audit_shares")
      .update({ views: (share.views ?? 0) + 1, last_viewed_at: new Date().toISOString() })
      .eq("id", share.id);
  }
  const snapshot = ver.snapshot as Snapshot;
  return { ok: true, snapshot, version: ver.version, name: snapshot.audit.name, shareId: share.id };
}

export interface ShareListing {
  version: number;
  createdAt: string;
  shareId: string;
  path: string;
  views: number;
  lastViewedAt: string | null;
  expiresAt: string;
  revokedAt: string | null;
}

/** Versions et liens d'un audit, la plus récente d'abord (console). */
export async function listShares(audit: Pick<AuditRow, "id" | "name">): Promise<ShareListing[] | null> {
  const admin = createAdminClient();
  const { data: versions, error } = await admin
    .from("restaurant_audit_versions")
    .select("id, version, created_at")
    .eq("audit_id", audit.id)
    .order("version", { ascending: false });
  if (isMissingTable(error)) return null;
  if (error) throw error;
  if (!versions?.length) return [];
  const { data: shares } = await admin
    .from("restaurant_audit_shares")
    .select("id, version_id, expires_at, revoked_at, views, last_viewed_at, created_at")
    .in("version_id", versions.map((v) => v.id));
  const out: ShareListing[] = [];
  for (const v of versions as VersionRow[]) {
    for (const sh of ((shares ?? []) as ShareRow[]).filter((x) => x.version_id === v.id)) {
      out.push({
        version: v.version,
        createdAt: sh.created_at,
        shareId: sh.id,
        path: sharePath(audit.name, v.version, tokenFor(sh.id)),
        views: sh.views,
        lastViewedAt: sh.last_viewed_at,
        expiresAt: sh.expires_at,
        revokedAt: sh.revoked_at,
      });
    }
  }
  return out;
}

export async function revokeShare(shareId: string): Promise<void> {
  const { error } = await createAdminClient().from("restaurant_audit_shares").update({ revoked_at: new Date().toISOString() }).eq("id", shareId);
  if (error) throw error;
}
