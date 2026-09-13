import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { listPendingDuplicateReviews } from "@/lib/duplicate-reviews";

// ADR 0052 — la file des doublons AMBIGUS, servie à l'onglet « Doublons » de
// Commandes. Elle avait sa propre page ; le même ticket apparaissait alors
// aussi dans le filtre « Suspectes » (badge « Doublon possible »), et le
// valider depuis là contournait la comparaison côte à côte en laissant la
// ligne `duplicate_reviews` en `pending`. Une seule file, un seul geste.
//
// Même garde que les autres surfaces de comptoir (gérant, manager, siège
// équipe, super-admin) : arbitrer un doublon n'est pas une des trois pages
// financières réservées (ADR 0041 §6).
export async function GET(request: NextRequest) {
  const restaurantId = request.nextUrl.searchParams.get("restaurantId");
  if (!restaurantId) return NextResponse.json({ error: "restaurantId requis." }, { status: 400 });

  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  // Tolérant : tant que la table `duplicate_reviews` n'existe pas (migration
  // non appliquée), l'onglet doit rester vide, jamais rouge — le reste de la
  // page Commandes n'a pas à tomber avec lui (fail-open, CLAUDE.md §5).
  try {
    const reviews = await listPendingDuplicateReviews(restaurantId);
    return NextResponse.json(reviews);
  } catch {
    return NextResponse.json([]);
  }
}
