import { randomUUID } from "node:crypto";
import { createAdminClient } from "./supabase";
import type { ReceiptAnalysis } from "./receipt-ocr";

// ADR 0036 — Conservation des tickets scannés.
//
// Toute image passée à Claude Vision est gardée 30 jours, qu'elle devienne
// une commande ou non, avec la lecture OCR d'origine. But : pouvoir comparer
// l'image ↔ ce que le modèle a lu ↔ ce que l'app a encodé, et voir les scans
// qui n'aboutissent pas (ils ne laissaient rien avant).
//
// Tout est best-effort : un échec de conservation ne doit JAMAIS faire
// échouer le scan d'un membre (même philosophie que lib/scan-meter.ts).

export const RECEIPT_RETENTION_DAYS = 30;

// Fenêtre pendant laquelle une soumission peut réutiliser l'image déjà
// stockée par son aperçu OCR, au lieu de la ré-uploader. Large : le membre
// peut hésiter, saisir son numéro à la main, être coupé par un appel.
const SCAN_REUSE_WINDOW_MINUTES = 120;

const BUCKET = "receipts";
const REMOVE_BATCH = 100;

export type ScanOutcome = "parsed" | "header_rejected" | "submitted";

function extensionFor(type: string): string {
  const ext = type.split("/")[1] ?? "jpg";
  return ext === "jpeg" ? "jpeg" : ext.replace(/[^a-z0-9]/gi, "") || "jpg";
}

/**
 * Range l'image scannée et la lecture OCR qui en a été faite.
 * Retourne l'identifiant du scan, ou null si la conservation a échoué —
 * l'appelant continue son chemin dans tous les cas.
 */
export async function storeScan(params: {
  restaurantId: string;
  userId: string;
  file: File;
  analysis: ReceiptAnalysis;
  outcome: ScanOutcome;
}): Promise<string | null> {
  const { restaurantId, userId, file, analysis, outcome } = params;
  try {
    const admin = createAdminClient();
    const storagePath = `${restaurantId}/${userId}/scan-${randomUUID()}.${extensionFor(file.type)}`;

    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, await file.arrayBuffer(), { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;

    const { data, error } = await admin
      .from("receipt_scans")
      .insert({
        restaurant_id: restaurantId,
        user_id: userId,
        storage_path: storagePath,
        ocr_order_number: analysis.order_number,
        ocr_amount: analysis.amount,
        ocr_confidence: analysis.confidence,
        ocr_order_time: analysis.order_time,
        ocr_has_restaurant_header: analysis.has_restaurant_header,
        ocr_items: analysis.items,
        outcome,
      })
      .select("id")
      .single();
    if (error) {
      // La ligne n'a pas pu être écrite (m58 pas encore appliquée ?) : on ne
      // laisse pas un fichier orphelin que la purge ne saurait pas retrouver.
      await admin.storage.from(BUCKET).remove([storagePath]);
      throw error;
    }
    return (data as { id: string }).id;
  } catch (e) {
    console.error("[receipt-scans] storeScan failed:", (e as Error).message);
    return null;
  }
}

/**
 * Chemin de l'image déjà stockée par l'aperçu OCR, si ce scan appartient bien
 * à ce membre, dans cet établissement, et date de moins de deux heures.
 * Évite de stocker deux fois la même photo à la soumission.
 */
export async function claimScanImage(
  scanId: string,
  userId: string,
  restaurantId: string
): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("receipt_scans")
      .select("storage_path, scanned_at")
      .eq("id", scanId)
      .eq("user_id", userId)
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    if (error) throw error;

    const row = data as { storage_path: string | null; scanned_at: string } | null;
    if (!row?.storage_path) return null;

    const ageMinutes = (Date.now() - new Date(row.scanned_at).getTime()) / 60000;
    return ageMinutes <= SCAN_REUSE_WINDOW_MINUTES ? row.storage_path : null;
  } catch (e) {
    console.error("[receipt-scans] claimScanImage failed:", (e as Error).message);
    return null;
  }
}

/** Rattache le scan à la commande qui en est sortie. */
export async function linkScanToOrder(
  scanId: string,
  userId: string,
  orderId: string
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("receipt_scans")
      .update({ outcome: "submitted", order_id: orderId })
      .eq("id", scanId)
      .eq("user_id", userId);
    if (error) throw error;
  } catch (e) {
    console.error("[receipt-scans] linkScanToOrder failed:", (e as Error).message);
  }
}

async function removeFiles(admin: ReturnType<typeof createAdminClient>, paths: string[]) {
  for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
    await admin.storage.from(BUCKET).remove(paths.slice(i, i + REMOVE_BATCH));
  }
}

export type PurgeResult = { scans: number; orderImages: number; orphans: number };

/**
 * Balayage des images que plus aucune ligne ne référence.
 *
 * La purge par lignes (`purgeExpiredReceipts`) ne voit que ce qui est encore
 * pointé par un `orders.receipt_url` ou un `receipt_scans.storage_path`. Une
 * commande supprimée — test, doublon nettoyé, effacement RGPD antérieur —
 * laissait donc son image dans le bucket **pour toujours** : au premier
 * inventaire (2026-08-20), 7 fichiers sur 8 étaient dans ce cas.
 *
 * Le balayage ne touche qu'aux fichiers de plus de 30 jours : une image tout
 * juste déposée est référencée dans la seconde qui suit, mais la fenêtre
 * d'âge suffit à ce qu'aucune course ne puisse l'emporter.
 */
async function sweepOrphanFiles(
  admin: ReturnType<typeof createAdminClient>,
  cutoff: string
): Promise<number> {
  const [{ data: orderRows }, { data: scanRows }] = await Promise.all([
    admin.from("orders").select("receipt_url").not("receipt_url", "is", null),
    admin.from("receipt_scans").select("storage_path").not("storage_path", "is", null),
  ]);
  const referenced = new Set<string>([
    ...((orderRows ?? []) as { receipt_url: string }[]).map((o) => o.receipt_url),
    ...((scanRows ?? []) as { storage_path: string }[]).map((s) => s.storage_path),
  ]);

  const orphans: string[] = [];
  const { data: restaurants } = await admin.storage.from(BUCKET).list("", { limit: 1000 });
  for (const resto of restaurants ?? []) {
    const { data: users } = await admin.storage.from(BUCKET).list(resto.name, { limit: 1000 });
    for (const user of users ?? []) {
      const prefix = `${resto.name}/${user.name}`;
      const { data: files } = await admin.storage.from(BUCKET).list(prefix, { limit: 1000 });
      for (const file of files ?? []) {
        const path = `${prefix}/${file.name}`;
        // `created_at` absent (dossier, métadonnée manquante) → on ne touche à rien.
        if (!file.created_at || file.created_at >= cutoff) continue;
        if (!referenced.has(path)) orphans.push(path);
      }
    }
  }

  if (orphans.length > 0) await removeFiles(admin, orphans);
  return orphans.length;
}

/**
 * Purge de rétention (ADR 0036) : plus AUCUNE image de ticket de plus de
 * 30 jours, qu'elle soit devenue une commande ou non.
 *   1. scans expirés  → fichier supprimé, ligne conservée sans image
 *      (`purged_at`), la statistique de lecture OCR survit.
 *   2. commandes de plus de 30 jours portant encore une image → fichier
 *      supprimé et `receipt_url` remis à NULL (la commande, elle, reste :
 *      c'est une pièce comptable).
 */
export async function purgeExpiredReceipts(now: Date = new Date()): Promise<PurgeResult> {
  const admin = createAdminClient();
  const cutoff = new Date(now.getTime() - RECEIPT_RETENTION_DAYS * 86400_000).toISOString();
  const result: PurgeResult = { scans: 0, orderImages: 0, orphans: 0 };

  // Par lots : PostgREST plafonne les retours, et un premier passage sur un
  // historique déjà ancien peut avoir beaucoup de retard à rattraper. La
  // borne d'itérations évite qu'une erreur silencieuse ne fasse tourner le
  // cron sans fin — le reliquat part au passage suivant.
  const BATCH = 500;
  const MAX_BATCHES = 40;

  // 1. Scans expirés : l'image part, la lecture OCR reste.
  for (let i = 0; i < MAX_BATCHES; i++) {
    const { data } = await admin
      .from("receipt_scans")
      .select("id, storage_path")
      .lt("scanned_at", cutoff)
      .not("storage_path", "is", null)
      .limit(BATCH);

    const rows = (data ?? []) as { id: string; storage_path: string }[];
    if (rows.length === 0) break;

    await removeFiles(admin, rows.map((s) => s.storage_path));
    await admin
      .from("receipt_scans")
      .update({ storage_path: null, purged_at: now.toISOString() })
      .in("id", rows.map((s) => s.id));
    result.scans += rows.length;
    if (rows.length < BATCH) break;
  }

  // 2. Images de commandes expirées (y compris celles d'avant l'ADR 0036,
  //    déposées directement par /api/orders sans ligne de scan).
  for (let i = 0; i < MAX_BATCHES; i++) {
    const { data } = await admin
      .from("orders")
      .select("id, receipt_url")
      .lt("submitted_at", cutoff)
      .not("receipt_url", "is", null)
      .limit(BATCH);

    const rows = (data ?? []) as { id: string; receipt_url: string }[];
    if (rows.length === 0) break;

    await removeFiles(admin, rows.map((o) => o.receipt_url));
    await admin
      .from("orders")
      .update({ receipt_url: null })
      .in("id", rows.map((o) => o.id));
    result.orderImages += rows.length;
    if (rows.length < BATCH) break;
  }

  // 3. Ce que plus aucune ligne ne référence. En dernier : les deux passes
  //    ci-dessus viennent de détacher des images, et si l'une d'elles a raté
  //    une suppression, ce balayage la rattrape au même passage.
  result.orphans = await sweepOrphanFiles(admin, cutoff);

  return result;
}

/**
 * Droit à l'effacement (ADR 0025) : les images d'un membre partent tout de
 * suite, sans attendre les 30 jours. Les commandes restent (comptabilité),
 * mais sans photo — le ticket est une donnée personnelle, pas une écriture.
 */
export async function purgeUserReceiptImages(userId: string): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data: scans } = await admin
      .from("receipt_scans")
      .select("id, storage_path")
      .eq("user_id", userId)
      .not("storage_path", "is", null);
    const scanRows = (scans ?? []) as { id: string; storage_path: string }[];
    if (scanRows.length > 0) {
      await removeFiles(admin, scanRows.map((s) => s.storage_path));
      await admin
        .from("receipt_scans")
        .update({ storage_path: null, purged_at: new Date().toISOString() })
        .in("id", scanRows.map((s) => s.id));
    }

    const { data: orders } = await admin
      .from("orders")
      .select("id, receipt_url")
      .eq("user_id", userId)
      .not("receipt_url", "is", null);
    const orderRows = (orders ?? []) as { id: string; receipt_url: string }[];
    if (orderRows.length > 0) {
      await removeFiles(admin, orderRows.map((o) => o.receipt_url));
      await admin.from("orders").update({ receipt_url: null }).in("id", orderRows.map((o) => o.id));
    }
  } catch (e) {
    console.error("[receipt-scans] purgeUserReceiptImages failed:", (e as Error).message);
  }
}
