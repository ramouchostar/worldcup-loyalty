import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { listAllReviews } from "@/lib/missions-reviews";
import { listOpenDisputes } from "@/lib/missions-superadmin";
import { DIRECTION_LABEL } from "@/lib/mission-reviews";
import { SubNav } from "../SubNav";
import { HideButton } from "./HideButton";

export const metadata = { title: "Avis — Prestataires — Plateforme" };
export const dynamic = "force-dynamic";

const CARD = "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl";
const when = (iso: string) => new Date(iso).toLocaleString("fr-BE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" });

// ADR 0084 §5 decies — tous les avis, privés compris. Masquer un avis le retire de la moyenne et des commentaires affichés aux
// restaurateurs ; il reste lisible ici, et la trace dit qui l'a masqué.
export default async function ReviewsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  if (!profile?.is_super_admin) redirect("/join?reason=platform-required");

  const [all, disputes] = await Promise.all([listAllReviews(), listOpenDisputes()]);
  const reviews = all.ok ? all.reviews : [];

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">Avis</h1>
        <SubNav active="avis" disputes={disputes.length} />
      </div>
      {!all.ok ? (
        <p className={`${CARD} p-5 text-sm text-gray-500`}>Les avis ne sont pas encore disponibles : applique les migrations du module Prestataires.</p>
      ) : reviews.length === 0 ? (
        <p className={`${CARD} p-5 text-sm text-gray-500`}>Aucun avis pour l&apos;instant. Ils arrivent quand une livraison est validée.</p>
      ) : (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li key={r.id} className={`${CARD} p-4 space-y-1.5 ${r.hiddenAt ? "opacity-60" : ""}`}>
              <p className="text-sm font-semibold">
                {r.rating}/5 · {r.restaurantName} <span className="text-gray-500 font-normal">· {r.providerName}</span>
              </p>
              <p className="text-xs text-gray-500">
                {DIRECTION_LABEL[r.direction]} · {when(r.createdAt)}
                {r.hiddenAt ? ` · masqué le ${when(r.hiddenAt)}` : ""}
              </p>
              {r.comment && <p className="text-sm whitespace-pre-line">{r.comment}</p>}
              <div className="flex gap-3 items-center">
                <HideButton reviewId={r.id} hidden={!!r.hiddenAt} />
                <a href={`/platform/prestataires/litiges/${r.missionId}`} className="text-xs underline underline-offset-2 text-gray-500">Voir le dossier</a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
