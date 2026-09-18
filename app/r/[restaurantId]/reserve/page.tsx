import { redirect } from "next/navigation";

// ADR 0061 — « Ma réserve » devient « Mes points ». L'ancienne adresse reste
// valable (liens des courriels, favoris) et mène au catalogue.
export default async function ReservePage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  redirect(`/r/${restaurantId}/points`);
}
