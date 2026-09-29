import Anthropic from "@anthropic-ai/sdk";
import { compileKeyPattern, type ReceiptKeyConfig } from "./receipt-config";
import { sanitizeKeyDate } from "./receipt-key-sanity";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type AllowedReceiptType = (typeof ALLOWED_TYPES)[number];

export function isAllowedReceiptType(type: string): type is AllowedReceiptType {
  return (ALLOWED_TYPES as readonly string[]).includes(type);
}

// ADR 0072 — qui lit le ticket. Sonnet lit toujours en premier ; Fable ne relit
// que si la première lecture est incomplète ; Haiku n'est plus qu'un secours si
// Sonnet est indisponible (panne, modèle non activé) — jamais la lecture normale.
export const FIRST_READ_MODEL = "claude-sonnet-5-5";
export const RESCUE_MODEL = "claude-fable-5-1";
export const FALLBACK_READ_MODEL = "claude-haiku-4-5-20251001";

// Effort de réflexion, réglé sans mesure : la trace (receipt_scans.ocr_trace)
// dit les jetons et les délais réels, c'est elle qui décidera d'y toucher.
const READ_EFFORT = "medium" as const;
// La réflexion compte dans max_tokens : 1 024 tronquait le JSON dès qu'un modèle réfléchit.
const MAX_OUTPUT_TOKENS = 4096;
// Les routes ont 60 s (maxDuration) : on garde de la marge pour la suite du traitement.
const TOTAL_BUDGET_MS = 52_000;
const FIRST_READ_TIMEOUT_MS = 30_000;
const RESCUE_TIMEOUT_MS = 25_000;
const MIN_TIME_FOR_ANOTHER_READ_MS = 8_000;

// Bestelnummer: YYYY-MM-DD/NNN/NNNNN
const BESTELNUMMER_RE = /\b(\d{4}-\d{2}-\d{2}\/\d{3}\/\d{5})\b/;

type VisionResult = {
  order_number: string | null;
  amount: number | null;
  has_restaurant_header: boolean;
  looks_like_qr_or_poster?: unknown;
  order_time?: unknown;
  items?: unknown;
  printed_date?: unknown;
  channel?: unknown;
  daily_sequence?: unknown;
  subtotal?: unknown;
  discount_total?: unknown;
  payment_method?: unknown;
};

export type ReceiptLineItem = {
  name: string;
  quantity: number;
  unit_price: number | null;
};

/** Ce que coûte une lecture : le modèle, le délai, les jetons facturés. */
export type ReadTrace = {
  model: string;
  ms: number;
  input_tokens: number | null;
  output_tokens: number | null;
};

/**
 * La trace de la lecture (ADR 0072, bouclier « trace ») : conservée dans
 * `receipt_scans.ocr_trace`. C'est elle qui dira si la règle « Fable relit ce que
 * Sonnet n'a pas lu » est bonne : part de relectures, part qui comble le trou,
 * désaccords, refus, délais.
 */
export type ReceiptReadTrace = {
  /** Lecture principale (Sonnet ; Haiku si `fell_back_from` est renseigné). */
  first: ReadTrace & { fell_back_from?: string; fallback_error?: string };
  /** Relecture par Fable, null si elle n'a pas eu lieu. `ok:false` = échec, refus ou délai dépassé. */
  rescue: (ReadTrace & { ok: boolean; refused?: boolean; error?: string }) | null;
  /** Ce que la relecture a comblé. */
  rescue_filled: RescueFilled[];
  /** Les deux lectures ont lu une valeur et elles diffèrent (la première est gardée). */
  rescue_conflict: boolean;
};

export type RescueFilled = "amount" | "key";

export type ReceiptAnalysis = {
  order_number: string | null;
  amount: number | null;
  confidence: number;
  has_restaurant_header: boolean;
  // Photo d'une AFFICHE/flyer/QR du programme plutôt que d'un ticket imprimé
  // (backlog « refuser les photos de QR et d'affiche ») : l'affiche porte le
  // nom du resto, donc l'en-tête seule ne suffit pas à la départager.
  looks_like_qr_or_poster: boolean;
  order_time: string | null;
  items: ReceiptLineItem[];
  // true si l'année de la date contenue dans la clé a été corrigée (lecture
  // OCR manifestement fausse, cf. lib/receipt-key-sanity.ts) — le client
  // invite alors le membre à vérifier le numéro.
  key_corrected: boolean;

  // Carte d’identité du ticket (ADR 0066) — ce qui permet de vérifier que la
  // lecture tient debout, et de reconnaître deux photos du même ticket.
  /** Date imprimée en tête du ticket (YYYY-MM-DD) — sert à contrôler la clé. */
  printed_date: string | null;
  /** Canal imprimé : « Self-order kiosk », « Intake module », « Eat in »… */
  channel: string | null;
  /** Numéro de séquence du jour (« Take away - 179 ») — jamais unique seul. */
  daily_sequence: string | null;
  /** Sous-total et remise imprimés : une remise explique qu'une somme ne tombe pas juste. */
  subtotal: number | null;
  discount_total: number | null;
  /** Moyen de paiement imprimé (« Cash », « Betalen met kaart ») — jamais de numéro de carte. */
  payment_method: string | null;
  // La clé telle que le modèle l'a lue, AVANT le contrôle de format — gardée
  // même quand elle est refusée : c'est elle qui dit si un format inconnu
  // (ex. « 2026-09-17/223/036 ») revient souvent (audit 2026-09-18).
  raw_order_number: string | null;
  // true si la clé vient de la relecture par Fable (ADR 0072) — avant : seconde
  // lecture de la clé seule (2026-09-18).
  key_second_read: boolean;
  /** Modèles, délais, jetons et effet de la relecture (ADR 0072). */
  trace: ReceiptReadTrace;
};

// Date du jour côté établissements (les tickets sont datés en heure belge).
function todayInBrussels(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Brussels" });
}

const ORDER_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const PRINTED_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_LINE_ITEMS = 30;

// ADR 0020 — les articles et l'heure sont du best effort strict :
// toute anomalie de forme est silencieusement écartée, jamais de throw,
// et ces champs n'entrent pas dans le calcul de confidence.
function sanitizeLineItems(raw: unknown): ReceiptLineItem[] {
  if (!Array.isArray(raw)) return [];
  const items: ReceiptLineItem[] = [];
  for (const entry of raw.slice(0, MAX_LINE_ITEMS)) {
    if (typeof entry !== "object" || entry === null) continue;
    const { name, quantity, unit_price } = entry as Record<string, unknown>;
    if (typeof name !== "string" || name.trim() === "") continue;
    const qty =
      typeof quantity === "number" && quantity > 0 && quantity <= 99 ? quantity : 1;
    const price =
      typeof unit_price === "number" && unit_price >= 0 && unit_price <= 500
        ? Math.round(unit_price * 100) / 100
        : null;
    items.push({ name: name.trim().slice(0, 120), quantity: qty, unit_price: price });
  }
  return items;
}

// ADR 0019 — section « clé de commande » du prompt, dynamique à partir de
// la config de l'établissement. Sans config : format Bestelnummer legacy.
function buildKeyPromptSection(config: ReceiptKeyConfig | null | undefined): string {
  if (config && !config.has_reliable_key) {
    return ""; // pas de clé fiable sur ce format de ticket : rien à extraire
  }
  if (config?.key_label && config.key_description) {
    const example = config.key_examples[0];
    const position = config.position_hint ? `, usually ${config.position_hint}` : "";
    return `1. ${config.key_label}: ${config.key_description}${position}${example ? ` (e.g. ${example})` : ""} — null if not visible\n`;
  }
  return "1. Bestelnummer: a code in format YYYY-MM-DD/NNN/NNNNN (e.g. 2026-06-01/258/03993) — null if not visible\n";
}

// Sur une photo difficile (petite dans le cadre, tournée, froissée) : ce que la
// seconde lecture de la clé disait déjà (2026-09-18), pour la relecture de Fable.
const RESCUE_HINT =
  "A first reading of this photo could not find everything, so read it carefully: the receipt may be small in the frame, rotated, upside down or crumpled — look closely at the payment block near the bottom, where the order code is printed. Never guess: null is better than an invented value.\n\n";

function buildReadPrompt(
  restaurantName: string,
  config: ReceiptKeyConfig | null | undefined,
  rescue: boolean
): string {
  return `${rescue ? RESCUE_HINT : ""}This is a receipt. Today is ${todayInBrussels()} (Europe/Brussels); receipts are normally from today or the last few days — read the YEAR and DATE digits exactly as printed, never assume the year from memory. Extract ONLY what you can clearly read:
${buildKeyPromptSection(config)}2. Total amount in euros (look for TOTAAL, TOTAL, "te betalen", "à payer") — return as a number, null if not visible
3. Whether the word "${restaurantName}" appears anywhere on the receipt
4. Order time in 24h HH:MM format if printed on the receipt — null if not visible
5. Line items ordered: for each clearly readable line, the item name as printed, the quantity (default 1) and the unit price in euros (null if unreadable). Maximum ${MAX_LINE_ITEMS} items, skip totals/taxes/payment lines.
6. printed_date: the date printed at the top of the receipt, as YYYY-MM-DD (null if not visible)
7. channel: the printed order channel if any ("Self-order kiosk", "Intake module", "Eat in", "Take away"…) — null if not visible
8. daily_sequence: the short daily order number printed in the header, e.g. "179" in "Take away - 179 | ZSM" — null if not visible
9. subtotal and discount_total: the printed subtotal and the printed discount/coupon amount as numbers (null if not printed)
10. payment_method: the printed payment method ("Cash", "Betalen met kaart"…) — null if not visible. NEVER read card numbers, authorisation codes or any banking identifier: ignore that block entirely.
11. Whether the photo shows a PROMOTIONAL POSTER, flyer, sticker, table sign or QR-code display (marketing material inviting to scan a code) rather than a printed till receipt — true only if it is clearly marketing material, false for any actual receipt even partial or blurry.

Return ONLY valid JSON, no markdown, no explanation:
{"order_number": "2026-06-01/258/03993" or null, "amount": 12.50 or null, "has_restaurant_header": true or false, "order_time": "18:42" or null, "items": [{"name": "Finest Burger", "quantity": 1, "unit_price": 11.50}], "looks_like_qr_or_poster": true or false, "printed_date": "2026-06-01" or null, "channel": "Self-order kiosk" or null, "daily_sequence": "179" or null, "subtotal": 15.00 or null, "discount_total": 7.10 or null, "payment_method": "Cash" or null}`;
}

// ---------------------------------------------------------------------------
// Un appel de lecture
// ---------------------------------------------------------------------------

/** Échec d'une lecture : porte le délai écoulé et dit si le modèle a refusé. */
export class ReadError extends Error {
  constructor(message: string, readonly ms: number, readonly refused = false) {
    super(message);
    this.name = "ReadError";
  }
}

/**
 * Le JSON que le modèle a écrit. Avec la réflexion activée, `content[0]` est un
 * bloc `thinking` : on cherche le bloc de texte, on ne suppose jamais sa place.
 */
export function readJsonFromContent(content: ReadonlyArray<{ type: string; text?: string }>): VisionResult {
  const rawText = content
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("")
    .trim();
  // Strip markdown code fences if model wraps output
  const jsonText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  return JSON.parse(jsonText) as VisionResult;
}

async function readOnce(
  client: Anthropic,
  opts: {
    model: string;
    /** Absent pour Haiku, qui n'accepte pas ce réglage. */
    effort?: typeof READ_EFFORT;
    mediaType: AllowedReceiptType;
    base64: string;
    prompt: string;
    timeoutMs: number;
    maxRetries: number;
  }
): Promise<{ parsed: VisionResult; trace: ReadTrace }> {
  const started = Date.now();
  try {
    const msg = await client.messages.create(
      {
        model: opts.model,
        max_tokens: MAX_OUTPUT_TOKENS,
        ...(opts.effort ? { output_config: { effort: opts.effort } } : {}),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: opts.mediaType, data: opts.base64 },
              },
              { type: "text", text: opts.prompt },
            ],
          },
        ],
      },
      { timeout: opts.timeoutMs, maxRetries: opts.maxRetries }
    );
    const ms = Date.now() - started;
    if (msg.stop_reason === "refusal") throw new ReadError("refus du modèle", ms, true);
    const parsed = readJsonFromContent(msg.content);
    return {
      parsed,
      trace: {
        model: opts.model,
        ms,
        input_tokens: msg.usage?.input_tokens ?? null,
        output_tokens: msg.usage?.output_tokens ?? null,
      },
    };
  } catch (err) {
    if (err instanceof ReadError) throw err;
    throw new ReadError((err as Error).message ?? "lecture impossible", Date.now() - started);
  }
}

// ---------------------------------------------------------------------------
// Interpréter une lecture, décider de la relire, fusionner
// ---------------------------------------------------------------------------

/** Une lecture, après contrôle de la clé et des bornes — avant d'en faire une analyse. */
export type Reading = {
  order_number: string | null;
  raw_order_number: string | null;
  key_corrected: boolean;
  amount: number | null;
  has_restaurant_header: boolean;
  looks_like_qr_or_poster: boolean;
  order_time: string | null;
  items: ReceiptLineItem[];
  printed_date: string | null;
  channel: string | null;
  daily_sequence: string | null;
  subtotal: number | null;
  discount_total: number | null;
  payment_method: string | null;
};

const money = (raw: unknown): number | null =>
  typeof raw === "number" && raw >= 0 && raw <= 1000 ? Math.round(raw * 100) / 100 : null;
const shortText = (raw: unknown, max: number): string | null =>
  typeof raw === "string" && raw.trim() ? raw.trim().slice(0, max) : null;

function interpretReading(
  parsed: VisionResult,
  keyPattern: RegExp | null,
  dateGroup: number | null,
  today: string
): Reading {
  // Validate la clé extraite contre le pattern de l'établissement
  // (ADR 0019), sinon contre le Bestelnummer legacy.
  const firstRawKey =
    typeof parsed.order_number === "string" && parsed.order_number.trim() ? parsed.order_number.trim() : null;
  const rawOrderNumber = keyPattern && firstRawKey && keyPattern.test(firstRawKey) ? firstRawKey : null;
  // Incident Kasia (2026-08-22) : l'OCR lisait l'année 2025 sur un ticket du
  // jour → numéro en lecture seule → date refusée à la soumission → 6 essais.
  // On répare une année manifestement fausse, on invalide une date future ou
  // trop vieille. Une clé réparée ou invalidée se reprend en photo : le
  // membre ne saisit plus rien (ADR 0058).
  const sanity = sanitizeKeyDate(rawOrderNumber, keyPattern, dateGroup, today);

  return {
    order_number: sanity.order_number,
    raw_order_number: firstRawKey ? firstRawKey.slice(0, 80) : null,
    key_corrected: sanity.corrected,
    amount:
      typeof parsed.amount === "number" && parsed.amount >= 1 && parsed.amount <= 500
        ? Math.round(parsed.amount * 100) / 100
        : null,
    has_restaurant_header: parsed.has_restaurant_header === true,
    looks_like_qr_or_poster: parsed.looks_like_qr_or_poster === true,
    order_time:
      typeof parsed.order_time === "string" && ORDER_TIME_RE.test(parsed.order_time) ? parsed.order_time : null,
    items: sanitizeLineItems(parsed.items),
    // Le `\d` manquait ici (ADR 0066 phase 1) : la date imprimée n'était jamais gardée.
    printed_date:
      typeof parsed.printed_date === "string" && PRINTED_DATE_RE.test(parsed.printed_date.trim())
        ? parsed.printed_date.trim()
        : null,
    channel: shortText(parsed.channel, 40),
    daily_sequence: shortText(parsed.daily_sequence, 12),
    subtotal: money(parsed.subtotal),
    discount_total: money(parsed.discount_total),
    payment_method: shortText(parsed.payment_method, 40),
  };
}

/**
 * Faut-il faire relire la photo par Fable ? (ADR 0072 §2)
 * Oui quand la lecture est INCOMPLÈTE : total absent, ou — pour un établissement
 * à clé fiable — aucune clé lue du tout. Non dans trois cas où relire ne servirait
 * à rien et coûterait cher :
 *  - une affiche (elle est refusée telle quelle, `judgeReceipt`) ;
 *  - une clé lue mais refusée par le format (ex. « …/223/036 ») : Fable la lirait pareil ;
 *  - une année de clé réparée : la clé existe, le membre reprend la photo.
 */
export function needsRescue(input: {
  amount: number | null;
  rawKey: string | null;
  orderNumber: string | null;
  hasKeyPattern: boolean;
  looksLikePoster: boolean;
}): boolean {
  if (input.looksLikePoster && input.orderNumber === null) return false;
  const amountMissing = input.amount === null;
  const keyMissing = input.hasKeyPattern && input.rawKey === null;
  return amountMissing || keyMissing;
}

/**
 * Fusion des deux lectures : la relecture COMBLE les trous, elle ne remplace rien.
 * Ce que la première lecture a lu reste (le ticket de loin de l'incident du
 * 2026-09-20 a montré qu'une lecture peut inventer : on ne laisse pas une
 * seconde lecture réécrire des valeurs déjà lues). Un désaccord est mesuré, pas tranché.
 */
export function mergeReadings(
  first: Reading,
  rescue: Reading
): { merged: Reading; filled: RescueFilled[]; conflict: boolean } {
  const filled: RescueFilled[] = [];
  const keyFromRescue = first.order_number === null && rescue.order_number !== null;
  if (keyFromRescue) filled.push("key");
  if (first.amount === null && rescue.amount !== null) filled.push("amount");

  const conflict =
    (first.amount !== null && rescue.amount !== null && first.amount !== rescue.amount) ||
    (first.order_number !== null && rescue.order_number !== null && first.order_number !== rescue.order_number);

  const merged: Reading = {
    order_number: first.order_number ?? rescue.order_number,
    raw_order_number: first.raw_order_number ?? rescue.raw_order_number,
    key_corrected: keyFromRescue ? rescue.key_corrected : first.key_corrected,
    amount: first.amount ?? rescue.amount,
    has_restaurant_header: first.has_restaurant_header || rescue.has_restaurant_header,
    // C'est le juge le plus capable qui dit « affiche » quand la première lecture n'avait rien trouvé.
    looks_like_qr_or_poster: rescue.looks_like_qr_or_poster,
    order_time: first.order_time ?? rescue.order_time,
    items: first.items.length > 0 ? first.items : rescue.items,
    printed_date: first.printed_date ?? rescue.printed_date,
    channel: first.channel ?? rescue.channel,
    daily_sequence: first.daily_sequence ?? rescue.daily_sequence,
    subtotal: first.subtotal ?? rescue.subtotal,
    discount_total: first.discount_total ?? rescue.discount_total,
    payment_method: first.payment_method ?? rescue.payment_method,
  };
  return { merged, filled, conflict };
}

/**
 * Analyse OCR d'un ticket de caisse via Claude vision.
 * Seule source de vérité anti-fraude : appelée côté serveur par la route
 * de soumission (orders) ET par la route d'aperçu UX (parse-receipt).
 * Throws si aucune lecture n'aboutit (Sonnet puis, en secours, Haiku).
 * `config` (ADR 0019) pilote la clé de commande recherchée ; absent =
 * comportement Bestelnummer historique.
 *
 * ADR 0072 : Sonnet lit ; si la lecture est incomplète, Fable relit et comble
 * les trous. Une relecture qui échoue (refus, délai, panne) ne fait jamais échouer
 * le scan : on garde la première lecture, et l'échec est écrit dans la trace.
 */
export async function analyzeReceipt(
  file: File,
  restaurantName: string,
  config?: ReceiptKeyConfig | null
): Promise<ReceiptAnalysis> {
  const startedAt = Date.now();
  const remaining = () => TOTAL_BUDGET_MS - (Date.now() - startedAt);

  const bytes = await file.arrayBuffer();
  const base64 = Buffer.from(bytes).toString("base64");
  const mediaType = file.type as AllowedReceiptType;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const keyPattern = config ? compileKeyPattern(config) : BESTELNUMMER_RE;
  const dateGroup = config ? config.date_group : 1; // legacy Bestelnummer : la date est le groupe 1
  const today = todayInBrussels();

  // 1. Lecture principale : Sonnet. En cas d'échec, secours par Haiku (comportement d'avant l'ADR 0072).
  let firstRead: { parsed: VisionResult; trace: ReadTrace };
  let firstTrace: ReceiptReadTrace["first"];
  try {
    firstRead = await readOnce(client, {
      model: FIRST_READ_MODEL,
      effort: READ_EFFORT,
      mediaType,
      base64,
      prompt: buildReadPrompt(restaurantName, config, false),
      timeoutMs: FIRST_READ_TIMEOUT_MS,
      maxRetries: 1,
    });
    firstTrace = firstRead.trace;
  } catch (primaryErr) {
    if (remaining() < MIN_TIME_FOR_ANOTHER_READ_MS) throw primaryErr;
    console.error("[receipt-ocr] lecture principale impossible, secours Haiku:", (primaryErr as Error).message);
    firstRead = await readOnce(client, {
      model: FALLBACK_READ_MODEL,
      mediaType,
      base64,
      prompt: buildReadPrompt(restaurantName, config, false),
      timeoutMs: Math.min(FIRST_READ_TIMEOUT_MS, remaining()),
      maxRetries: 0,
    });
    firstTrace = {
      ...firstRead.trace,
      fell_back_from: FIRST_READ_MODEL,
      fallback_error: (primaryErr as Error).message.slice(0, 120),
    };
  }

  let reading = interpretReading(firstRead.parsed, keyPattern, dateGroup, today);
  const trace: ReceiptReadTrace = { first: firstTrace, rescue: null, rescue_filled: [], rescue_conflict: false };

  // 2. Relecture par Fable, seulement si la lecture est incomplète et qu'il reste du temps.
  if (
    needsRescue({
      amount: reading.amount,
      rawKey: reading.raw_order_number,
      orderNumber: reading.order_number,
      hasKeyPattern: keyPattern !== null,
      looksLikePoster: reading.looks_like_qr_or_poster,
    }) &&
    remaining() >= MIN_TIME_FOR_ANOTHER_READ_MS
  ) {
    const rescueStarted = Date.now();
    try {
      const second = await readOnce(client, {
        model: RESCUE_MODEL,
        effort: READ_EFFORT,
        mediaType,
        base64,
        prompt: buildReadPrompt(restaurantName, config, true),
        timeoutMs: Math.min(RESCUE_TIMEOUT_MS, remaining()),
        maxRetries: 0,
      });
      const { merged, filled, conflict } = mergeReadings(
        reading,
        interpretReading(second.parsed, keyPattern, dateGroup, today)
      );
      reading = merged;
      trace.rescue = { ...second.trace, ok: true };
      trace.rescue_filled = filled;
      trace.rescue_conflict = conflict;
    } catch (err) {
      const failure = err instanceof ReadError ? err : null;
      console.error("[receipt-ocr] relecture impossible:", (err as Error).message);
      trace.rescue = {
        model: RESCUE_MODEL,
        ms: failure?.ms ?? Date.now() - rescueStarted,
        input_tokens: null,
        output_tokens: null,
        ok: false,
        refused: failure?.refused || undefined,
        error: (err as Error).message.slice(0, 120),
      };
    }
  }

  // La confidence reste basée uniquement sur clé + montant : les articles
  // et l'heure (ADR 0020) ne participent jamais au flagging.
  const confidence = reading.order_number && reading.amount ? 90 : reading.order_number || reading.amount ? 65 : 35;

  return {
    ...reading,
    confidence,
    key_second_read: trace.rescue_filled.includes("key"),
    trace,
  };
}
