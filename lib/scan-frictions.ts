// Détection de FRICTIONS dans les scans de tickets (receipt_scans, ADR 0036).
//
// Signature de l'incident Kasia (22/08/2026) : un même membre enchaîne des
// scans « parsed » (lus, jamais soumis) ou « header_rejected » en quelques
// minutes — il essaie, ça échoue, il recommence. Personne ne l'a vu sur le
// moment. Ici : dès qu'un membre cumule ≥ MIN_SCANS scans dans une fenêtre de
// WINDOW_MIN minutes sans qu'une soumission vienne clore la série, on remonte
// une friction sur /platform/scans, avec ce que l'OCR a lu à chaque essai.
// Pur, sans dépendance : testable (lib/scan-frictions.test.ts).

export type FrictionScan = {
  id: string;
  restaurant_id: string;
  user_id: string;
  scanned_at: string; // ISO
  outcome: "parsed" | "header_rejected" | "submitted";
  ocr_order_number: string | null;
  ocr_amount: number | null;
  ocr_has_restaurant_header: boolean | null;
};

export type Friction = {
  user_id: string;
  restaurant_id: string;
  scans: FrictionScan[];     // chronologique
  attempts: number;          // scans non soumis dans la série
  from: string;              // ISO du 1er scan
  to: string;                // ISO du dernier scan de la série
  resolved: boolean;         // une soumission a fini par passer dans la série
  // Indices d'explication (heuristiques, jamais une certitude)
  hints: string[];
};

export const FRICTION_MIN_SCANS = 3;
export const FRICTION_WINDOW_MIN = 10;

const ms = (iso: string) => new Date(iso).getTime();

function hintsFor(series: FrictionScan[]): string[] {
  const hints: string[] = [];
  const unsubmitted = series.filter((s) => s.outcome !== "submitted");
  const rejected = unsubmitted.filter((s) => s.outcome === "header_rejected").length;
  if (rejected >= 2) hints.push(`${rejected} refus d'entête (photo pas reconnue comme un ticket du resto)`);

  const numbers = unsubmitted.map((s) => s.ocr_order_number).filter((n): n is string => !!n);
  const distinct = new Set(numbers);
  if (numbers.length >= 2 && distinct.size === 1) {
    hints.push(`même n° lu ${numbers.length}× (${numbers[0]}) sans soumission — refus probable à la validation (date/format)`);
  }
  const years = numbers.map((n) => n.match(/^(\d{4})-\d{2}-\d{2}/)?.[1]).filter((y): y is string => !!y);
  const nowYear = String(new Date().getUTCFullYear());
  if (years.some((y) => y !== nowYear)) hints.push(`année lue ≠ ${nowYear} sur au moins un essai (lecture OCR de l'année)`);

  const noNumber = unsubmitted.filter((s) => !s.ocr_order_number).length;
  if (noNumber >= 2) hints.push(`${noNumber} essais sans numéro lisible`);
  if (hints.length === 0) hints.push("essais répétés sans soumission — cause à regarder sur les images");
  return hints;
}

export function detectScanFrictions(
  scans: FrictionScan[],
  opts: { minScans?: number; windowMin?: number } = {}
): Friction[] {
  const minScans = opts.minScans ?? FRICTION_MIN_SCANS;
  const windowMs = (opts.windowMin ?? FRICTION_WINDOW_MIN) * 60_000;

  // Regrouper par (membre, resto), trier chronologiquement
  const groups = new Map<string, FrictionScan[]>();
  for (const s of scans) {
    const k = `${s.user_id}|${s.restaurant_id}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(s);
  }

  const out: Friction[] = [];
  for (const list of groups.values()) {
    list.sort((a, b) => ms(a.scanned_at) - ms(b.scanned_at));
    // Séries : scans consécutifs espacés de moins de windowMs
    let series: FrictionScan[] = [];
    const flush = () => {
      const attempts = series.filter((s) => s.outcome !== "submitted").length;
      if (attempts >= minScans) {
        out.push({
          user_id: series[0].user_id,
          restaurant_id: series[0].restaurant_id,
          scans: [...series],
          attempts,
          from: series[0].scanned_at,
          to: series[series.length - 1].scanned_at,
          resolved: series.some((s) => s.outcome === "submitted"),
          hints: hintsFor(series),
        });
      }
      series = [];
    };
    for (const s of list) {
      if (series.length && ms(s.scanned_at) - ms(series[series.length - 1].scanned_at) > windowMs) flush();
      series.push(s);
    }
    flush();
  }
  // Plus récentes d'abord
  return out.sort((a, b) => ms(b.to) - ms(a.to));
}
