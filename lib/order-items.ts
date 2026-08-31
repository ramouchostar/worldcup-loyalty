import { createAdminClient } from "./supabase";
import { getMenuItems } from "./menu";
import { getMenuAliases } from "./menu-aliases";
import { buildTicketMatcher } from "./menu-match";
import type { ReceiptLineItem } from "./receipt-ocr";

// ADR 0020 (amendé ADR 0046) — Persistance des lignes d'articles lues sur le
// ticket, rapprochées via alias + catalogue + canonisation ; les lignes
// techniques de caisse arrivent marquées `is_ignored`.
// Best effort strict : ne throw JAMAIS — un échec ici ne doit ni bloquer
// ni retarder la validation de la commande ou la récompense.
export async function insertOrderItems(
  orderId: string,
  restaurantId: string,
  items: ReceiptLineItem[]
): Promise<void> {
  if (items.length === 0) return;
  try {
    const admin = createAdminClient();
    const [menu, aliases] = await Promise.all([getMenuItems(restaurantId), getMenuAliases(restaurantId)]);
    const matchLine = buildTicketMatcher(menu, aliases);

    const rows = items.map((item, index) => {
      const m = matchLine(item.name);
      return {
        order_id: orderId,
        line_index: index,
        raw_name: item.name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        menu_item_id: m.menuItemId,
        is_ignored: m.ignored,
      };
    });

    let { error } = await admin
      .from("order_items")
      .upsert(rows, { onConflict: "order_id,line_index", ignoreDuplicates: true });
    if (error && /is_ignored/.test(error.message)) {
      // Migration 20260831-2335 pas appliquée → variante sans la colonne.
      ({ error } = await admin
        .from("order_items")
        .upsert(rows.map(({ is_ignored: _ignored, ...r }) => r), {
          onConflict: "order_id,line_index",
          ignoreDuplicates: true,
        }));
    }
    if (error) throw new Error(error.message);
  } catch (err) {
    console.error("[order-items] insertion best-effort échouée:", err);
  }
}
