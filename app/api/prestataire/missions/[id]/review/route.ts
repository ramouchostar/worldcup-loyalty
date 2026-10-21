import { reviewRestaurant } from "@/lib/missions-reviews";
import { reviewResponse } from "@/lib/missions-reviews-http";
import { requireProvider } from "@/lib/providers";

// POST /api/prestataire/missions/[id]/review — le prestataire note le restaurateur (PRIVÉ : la plateforme seule le lit). Définitif.
// Body : { rating: 1..5, comment? }.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireProvider();
  if (!guard.ok) return guard.response;
  const body = await req.json().catch(() => null);
  return reviewResponse(await reviewRestaurant(id, guard.provider, body));
}
