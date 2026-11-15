import { redirect } from "next/navigation";

// L'ex-page Prévisions (ADR 0027) vit désormais dans la page « Chiffre
// d'affaires » (section « Les 7 prochains jours ») : les anciens liens et
// e-mails y mènent directement.
export default async function ForecastRedirect({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  redirect(`/admin/${encodeURIComponent(restaurantId)}/chiffre#previsions`);
}
