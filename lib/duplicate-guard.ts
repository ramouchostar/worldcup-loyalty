import { createAdminClient } from "./supabase";
import { contentFingerprint, type FingerprintLine } from "./receipt-fingerprint";
import {
  detectDuplicate,
  SAME_USER_WINDOW_HOURS,
  type CandidateOrder,
  type DuplicateVerdict,
} from "./duplicate-detection";
import { computeImagePhashFromFile } from "./image-phash-server";

// ============================================================
// Couche d'accès du dédoublonnage — phase C.
//
// Isole app/api/orders/route.ts de tout ce qui touche la base : chargement des
// commandes candidates, calcul du hachage d'image, journalisation. Le moteur de
// décision (lib/duplicate-detection.ts) reste pur et testable.
//
// TOUT EST FAIL-OPEN. La migration 20260904-1830 est appliquée à la main
// (docs/migrations/README.md) : tant qu'elle ne l'est pas, les colonnes et la
// table n'existent pas. Aucune de ces absences ne doit refuser un ticket à un
// membre — le verrou historique (index UNIQUE sur `duplicate_key`, ADR 0008 /
// 0019) reste en place et suffit à ne rien casser. Le renfort s'active tout
// seul dès que la migration est passée.
// ============================================================

/** Nombre maximal de commandes confrontées à une soumission. */
const MAX_CANDIDATES = 200;
/** Au-delà, on ne charge plus les lignes d'articles (règle « empreinte proche »). */
const MAX_ITEM_LOOKUPS = 40;

export type GuardInput = {
  restaurantId: string;
  userId: string;
  /** YYYY-MM-DD — date retenue pour la commande. */
  orderDate: string;
  /** HH:MM lue par l'OCR serveur, ou null. */
  orderTime: string | null;
  amount: number;
  orderNumber: string | null;
  /** Lignes lues par l'OCR serveur (ADR 0020). */
  items: FingerprintLine[];
  /** Photo reçue par le serveur — jamais un hachage envoyé par le client. */
  receiptFile: File | null;
};

export type GuardResult = {
  verdict: DuplicateVerdict;
  /** À stocker sur la commande (ignoré si la colonne n'existe pas encore). */
  fingerprint: string | null;
  imagePhash: string | null;
};

const OK: DuplicateVerdict = { decision: "ok", rule: null, matchedOrderId: null, detail: "" };

function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

const CANDIDATE_COLUMNS_FULL =
  "id, user_id, order_date, order_time, amount, order_number, submitted_at, content_fingerprint, image_phash";
const CANDIDATE_COLUMNS_LEGACY =
  "id, user_id, order_date, order_time, amount, order_number, submitted_at";

type RawOrder = {
  id: string;
  user_id: string;
  order_date: string;
  order_time: string | null;
  amount: number | string;
  order_number: string | null;
  submitted_at: string;
  content_fingerprint?: string | null;
  image_phash?: string | null;
};

function toCandidate(row: RawOrder): CandidateOrder {
  return {
    id: row.id,
    user_id: row.user_id,
    order_date: row.order_date,
    order_time: row.order_time,
    amount: Number(row.amount),
    order_number: row.order_number,
    content_fingerprint: row.content_fingerprint ?? null,
    image_phash: row.image_phash ?? null,
    submitted_at: row.submitted_at,
  };
}

/**
 * Commandes susceptibles de correspondre : la journée du ticket (± 1 jour, pour
 * les tickets de fin de service qui basculent à minuit) dans cet établissement,
 * plus les commandes récentes du même membre quelle que soit leur date — ce
 * sont elles qu'attrapent les signaux « image » et « heure + montant ».
 *
 * Les commandes déjà rejetées sont exclues : un ticket refusé n'a rien crédité,
 * le resoumettre est légitime.
 */
async function loadCandidates(input: GuardInput): Promise<CandidateOrder[]> {
  const admin = createAdminClient();
  const sinceIso = new Date(Date.now() - SAME_USER_WINDOW_HOURS * 3_600_000).toISOString();

  const run = async (columns: string) => {
    const [sameDay, sameUser] = await Promise.all([
      admin
        .from("orders")
        .select(columns)
        .eq("restaurant_id", input.restaurantId)
        .gte("order_date", shiftDay(input.orderDate, -1))
        .lte("order_date", shiftDay(input.orderDate, 1))
        .neq("status", "rejected")
        .order("submitted_at", { ascending: false })
        .limit(MAX_CANDIDATES),
      admin
        .from("orders")
        .select(columns)
        .eq("restaurant_id", input.restaurantId)
        .eq("user_id", input.userId)
        .gte("submitted_at", sinceIso)
        .neq("status", "rejected")
        .order("submitted_at", { ascending: false })
        .limit(MAX_CANDIDATES),
    ]);
    if (sameDay.error) throw sameDay.error;
    if (sameUser.error) throw sameUser.error;
    return [
      ...((sameDay.data ?? []) as unknown as RawOrder[]),
      ...((sameUser.data ?? []) as unknown as RawOrder[]),
    ];
  };

  let rows: RawOrder[];
  try {
    rows = await run(CANDIDATE_COLUMNS_FULL);
  } catch {
    // Migration 20260904-1830 pas encore appliquée : les deux colonnes
    // n'existent pas. On travaille sans elles — les signaux « même membre,
    // heure + montant » et « empreinte proche » fonctionnent quand même.
    rows = await run(CANDIDATE_COLUMNS_LEGACY);
  }

  const unique = new Map<string, CandidateOrder>();
  for (const row of rows) if (!unique.has(row.id)) unique.set(row.id, toCandidate(row));
  return [...unique.values()];
}

/**
 * Charge les lignes d'articles des candidats les plus pertinents — celles du
 * même membre, du même montant, ou de même empreinte. Sans elles, la règle
 * « empreinte proche » (lecture partielle) se tait au lieu de deviner.
 */
async function attachItems(
  candidates: CandidateOrder[],
  input: GuardInput,
  fingerprint: string
): Promise<void> {
  const pertinents = candidates
    .filter(
      (c) =>
        c.user_id === input.userId ||
        c.content_fingerprint === fingerprint ||
        Math.abs(c.amount - input.amount) < 0.005
    )
    .slice(0, MAX_ITEM_LOOKUPS);
  if (pertinents.length === 0) return;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("order_items")
    .select("order_id, raw_name, quantity, unit_price")
    .in(
      "order_id",
      pertinents.map((c) => c.id)
    );
  if (error) throw error;

  const parOrdre = new Map<string, FingerprintLine[]>();
  for (const row of (data ?? []) as {
    order_id: string;
    raw_name: string;
    quantity: number | string;
    unit_price: number | string | null;
  }[]) {
    const list = parOrdre.get(row.order_id) ?? [];
    list.push({
      name: row.raw_name,
      quantity: Number(row.quantity),
      unit_price: row.unit_price === null ? null : Number(row.unit_price),
    });
    parOrdre.set(row.order_id, list);
  }
  for (const c of pertinents) c.items = parOrdre.get(c.id) ?? [];
}

/**
 * Confronte une soumission à l'historique.
 *
 * Ne lève JAMAIS : en cas de panne, renvoie un verdict `ok` — le verrou
 * historique sur `duplicate_key` reste le filet, et un incident de
 * dédoublonnage ne doit pas refuser le ticket d'un client légitime.
 */
export async function guardAgainstDuplicates(input: GuardInput): Promise<GuardResult> {
  const fingerprint = contentFingerprint({
    restaurantId: input.restaurantId,
    amount: input.amount,
    items: input.items,
  });

  // Le hachage se calcule à part : son échec ne doit pas priver des trois
  // autres signaux.
  let imagePhash: string | null = null;
  if (input.receiptFile) {
    imagePhash = await computeImagePhashFromFile(input.receiptFile);
  }

  try {
    const candidates = await loadCandidates(input);
    try {
      await attachItems(candidates, input, fingerprint.hash);
    } catch (e) {
      // Lignes indisponibles : la règle « empreinte proche » se tait, le reste
      // du moteur travaille normalement.
      console.error("[duplicate-guard] attachItems failed:", (e as Error).message);
    }

    const verdict = detectDuplicate(
      {
        userId: input.userId,
        orderDate: input.orderDate,
        orderTime: input.orderTime,
        amount: input.amount,
        orderNumber: input.orderNumber,
        fingerprint,
        imagePhash,
        submittedAt: new Date().toISOString(),
        items: input.items,
      },
      candidates
    );
    return { verdict, fingerprint: fingerprint.hash, imagePhash };
  } catch (e) {
    console.error("[duplicate-guard] detection failed:", (e as Error).message);
    return { verdict: OK, fingerprint: fingerprint.hash, imagePhash };
  }
}

export type ReviewStatus = "auto_rejected" | "pending";

/**
 * Trace un rapprochement. Best-effort : la table peut ne pas exister encore
 * (migration manuelle), et son absence ne doit rien casser.
 */
export async function recordDuplicateReview(params: {
  restaurantId: string;
  userId: string;
  orderId: string | null;
  verdict: DuplicateVerdict;
  status: ReviewStatus;
}): Promise<void> {
  if (!params.verdict.rule) return;
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("duplicate_reviews").insert({
      restaurant_id: params.restaurantId,
      user_id: params.userId,
      order_id: params.orderId,
      matched_order_id: params.verdict.matchedOrderId,
      rule: params.verdict.rule,
      detail: params.verdict.detail,
      status: params.status,
    });
    if (error) throw error;
  } catch (e) {
    console.error("[duplicate-guard] recordDuplicateReview failed:", (e as Error).message);
  }
}
