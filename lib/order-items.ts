import { createAdminClient } from "./supabase";
import { getMenuItems } from "./menu";
import { buildMenuMatcher } from "./menu-match";
import type { ReceiptLineItem } from "./receipt-ocr";

// ADR 0020 — Persistance des lignes d'articles lues sur le ticket.
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
    const matchMenuItem = buildMenuMatcher(await getMenuItems(restaurantId));

    const rows = items.map((item, index) => ({
      order_id: orderId,
      line_index: index,
      raw_name: item.name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      menu_item_id: matchMenuItem(item.name),
    }));

    const { error } = await admin
      .from("order_items")
      .upsert(rows, { onConflict: "order_id,line_index", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  } catch (err) {
    console.error("[order-items] insertion best-effort échouée:", err);
  }
}
