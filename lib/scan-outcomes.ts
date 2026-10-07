// Page Tickets (plateforme) — lecture honnête de l'entonnoir des scans.
// Un visiteur sans compte laisse d'abord une ligne « aperçu » (parsed, sans
// photo, user_id NULL), puis une seconde ligne avec photo une fois son compte
// créé (ADR 0045/0058). Compter les deux, c'est gonfler « Jamais soumis » et
// afficher « Jamais soumis » sur un ticket qui est bien devenu commande.
// Pur, sans réseau : testable.

export type ScanLite = {
  id: string;
  restaurant_id: string;
  user_id: string | null;
  ocr_order_number: string | null;
  outcome: "parsed" | "header_rejected" | "submitted";
};

const ticketKey = (s: ScanLite) =>
  s.ocr_order_number ? `${s.restaurant_id}|${s.ocr_order_number}` : null;

export type ScanOutcomeSummary = {
  // Lignes « aperçu visiteur » dont le ticket a ensuite donné une commande.
  previewBecameOrder: Set<string>;
  // Tickets distincts lus mais jamais soumis (aperçus devenus commandes exclus).
  abandonedTickets: number;
};

export function summarizeScanOutcomes(scans: ScanLite[]): ScanOutcomeSummary {
  const submittedKeys = new Set<string>();
  for (const s of scans) {
    const k = ticketKey(s);
    if (s.outcome === "submitted" && k) submittedKeys.add(k);
  }

  const previewBecameOrder = new Set<string>();
  const abandoned = new Set<string>();
  for (const s of scans) {
    if (s.outcome !== "parsed") continue;
    const k = ticketKey(s);
    if (k && submittedKeys.has(k)) {
      if (!s.user_id) previewBecameOrder.add(s.id);
      continue;
    }
    // Sans numéro lisible on ne peut pas dédoublonner : une ligne = un ticket.
    abandoned.add(k ?? `scan:${s.id}`);
  }
  return { previewBecameOrder, abandonedTickets: abandoned.size };
}
