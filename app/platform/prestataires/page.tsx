import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { listProviders } from "@/lib/providers";
import { InviteForm, LinkBox, ProviderActions } from "./ProviderControls";

export const metadata = { title: "Prestataires — Plateforme" };
export const dynamic = "force-dynamic";

const CARD = "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl";
const METIER_LABEL: Record<string, string> = { video: "Vidéo", photo: "Photo", design: "Design", impression: "Impression" };
const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  invited: { text: "Invité", cls: "bg-amber-100 text-amber-900" },
  active: { text: "Actif", cls: "bg-emerald-100 text-emerald-900" },
  suspended: { text: "Suspendu", cls: "bg-gray-200 text-gray-800" },
  excluded: { text: "Exclu", cls: "bg-red-100 text-red-900" },
};

// ADR 0084 — les prestataires : inviter (le lien est lié à leur adresse), relancer, suspendre.
// Première version : la liste et l'invitation. Missions, litiges et configuration suivent (PR F).
export default async function PlatformProvidersPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).single();
  if (!profile?.is_super_admin) redirect("/join?reason=platform-required");

  const result = await listProviders();

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Prestataires</h1>
        <p className="text-sm text-gray-500 mt-1">
          Vidéastes, photographes, graphistes, imprimeurs. Ils sont créés sur invitation : le lien est lié à leur adresse e-mail et ne sert qu&apos;une fois.
        </p>
      </div>

      <section className={`${CARD} p-5 space-y-3`}>
        <h2 className="font-semibold">Inviter un prestataire</h2>
        <InviteForm />
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Les prestataires</h2>
        {!result.ok ? (
          <p className={`${CARD} p-5 text-sm text-gray-500`}>
            Le module n&apos;est pas encore disponible : applique les migrations <code>20261009-1030-prestataires-schema</code> et <code>20261009-1500-prestataires-invitations</code>.
          </p>
        ) : result.providers.length === 0 ? (
          <p className={`${CARD} p-5 text-sm text-gray-500`}>Aucun prestataire pour l&apos;instant. Invite le premier ci-dessus.</p>
        ) : (
          <ul className="space-y-3">
            {result.providers.map((p) => {
              const st = STATUS_LABEL[p.status] ?? STATUS_LABEL.invited;
              return (
                <li key={p.id} className={`${CARD} p-5 space-y-3`}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-semibold">{p.display_name}</p>
                      <p className="text-xs text-gray-500">
                        {p.email} · {p.metiers.map((m) => METIER_LABEL[m] ?? m).join(", ") || "aucun métier"}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Invité le {new Date(p.created_at).toLocaleDateString("fr-BE", { day: "numeric", month: "long", timeZone: "Europe/Brussels" })}
                        {p.activated_at ? ` · actif depuis le ${new Date(p.activated_at).toLocaleDateString("fr-BE", { day: "numeric", month: "long", timeZone: "Europe/Brussels" })}` : ""}
                        {p.warnings > 0 ? ` · ${p.warnings} avertissement${p.warnings > 1 ? "s" : ""}` : ""}
                        {p.visibility_reduced ? " · visibilité réduite" : ""}
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${st.cls}`}>{st.text}</span>
                  </div>
                  {p.status === "invited" && p.invite && (
                    <div className="space-y-1">
                      <p className="text-xs text-gray-500">Lien en cours, valable jusqu&apos;au {new Date(p.invite.expiresAt).toLocaleDateString("fr-BE", { day: "numeric", month: "long", timeZone: "Europe/Brussels" })} :</p>
                      <LinkBox url={p.invite.url} />
                    </div>
                  )}
                  {p.status === "invited" && !p.invite && <p className="text-xs text-amber-700">Le lien a expiré ou été remplacé : génère-en un nouveau.</p>}
                  <ProviderActions providerId={p.id} status={p.status} hasAccount={!!p.user_id} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
