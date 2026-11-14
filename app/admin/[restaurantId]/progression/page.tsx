import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { SimpleHomePage } from "../SimpleHomePage";

// « Ta progression » — l'ancien accueil de la vue simple (ADR 0064 : objectif,
// à faire, prochaine étape ; ADR 0081 : le jeu de la croissance ; ADR 0087 :
// le CA jour par jour), inchangé. L'onglet « Stats » a pris l'adresse de
// l'accueil le 2026-11-14 et renvoie ici par la carte « Ta progression ».
export default async function ProgressionPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <SimpleHomePage restaurantId={restaurantId} userId={user.id} bienvenue={false} />;
}
