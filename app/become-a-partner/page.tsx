import { createServerSupabaseClient } from "@/lib/supabase";
import { PartnerSignup } from "./PartnerSignup";

// ADR 0075 — l'inscription restaurateur commence SANS compte : recherche
// Google, établissements corrigés, puis compte (/signup?as=resto) qui les crée.
// Le middleware laisse passer un visiteur sans compte sur cette page seule ;
// les étapes suivantes (/become-a-partner/<id>/…) restent réservées au compte.
export const dynamic = "force-dynamic";

export default async function BecomeAPartnerPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  return <PartnerSignup signedIn={!!user} />;
}
