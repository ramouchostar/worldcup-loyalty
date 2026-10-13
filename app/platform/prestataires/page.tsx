import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase";
import { listProviders } from "@/lib/providers";
import { listQuotedMissions } from "@/lib/missions-dates";
import { listUnconfirmed } from "@/lib/missions-presence";
import { dateLabelFr } from "@/lib/mission-team-message";
import { formatEuros } from "@/lib/mission-money";
import { listMissedShoots, listToSettle } from "@/lib/missions-cancel";
import { describeSettlement, sanctionLabel } from "@/lib/mission-cancel-rules";
import { AcceptQuoteButton, InviteForm, LinkBox, MissedShootControls, ProviderActions, SettleButton } from "./ProviderControls";

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

  const [result, quoted, watched, missed, toSettle] = await Promise.all([listProviders(), listQuotedMissions(), listUnconfirmed(), listMissedShoots(), listToSettle()]);

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

      {watched.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold">Présences à confirmer (tournage dans 2 jours ou moins)</h2>
          <p className="text-xs text-gray-500">Un rappel part par e-mail ; si personne ne répond, appelle. Un tournage annulé à moins de 48 h est dû en entier.</p>
          <ul className="space-y-3">
            {watched.map((w) => (
              <li key={w.id} className={`${CARD} p-5`}>
                <p className="font-semibold">
                  {w.restaurant_name} <span className="text-gray-500 font-normal">· {w.provider_name}</span>
                </p>
                <p className="text-xs text-gray-500">
                  {dateLabelFr(w.shoot_date)}{w.shoot_start ? ` à ${w.shoot_start}` : ""} · <span className="text-amber-700 font-semibold">pas confirmé : {w.missing.join(", ")}</span>
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {missed.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold">Tournages passés sans démarrage</h2>
          <p className="text-xs text-gray-500">Le jour est passé et le prestataire n&apos;a pas touché « Je suis arrivé ». Appelle les deux parties, puis tranche : une absence est due en entier à celui qui est en faute ; une force majeure rembourse tout, sans sanction.</p>
          <ul className="space-y-3">
            {missed.map((m) => (
              <li key={m.id} className={`${CARD} p-5 space-y-3`}>
                <p className="font-semibold">
                  {m.restaurant_name} <span className="text-gray-500 font-normal">· {m.provider_name}</span>
                </p>
                <p className="text-xs text-gray-500">Prévu le {dateLabelFr(m.shoot_date)}{m.shoot_start ? ` à ${m.shoot_start}` : ""}</p>
                <MissedShootControls missionId={m.id} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {toSettle.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold">Annulations à régler</h2>
          <p className="text-xs text-gray-500">Tant que le paiement en ligne n&apos;est pas ouvert, le remboursement ou le règlement se fait à la main. Le calcul tient compte de l&apos;acompte déjà reçu.</p>
          <ul className="space-y-3">
            {toSettle.map((c) => (
              <li key={c.id} className={`${CARD} p-5 flex items-start justify-between gap-3 flex-wrap`}>
                <div className="min-w-0 space-y-0.5">
                  <p className="font-semibold">
                    {c.restaurant_name} <span className="text-gray-500 font-normal">· {c.provider_name}</span>
                  </p>
                  <p className="text-xs text-gray-500">
                    Annulée le {new Date(c.cancelled_at).toLocaleDateString("fr-BE", { day: "numeric", month: "long", timeZone: "Europe/Brussels" })} par {c.record.by === "provider" ? "le prestataire" : c.record.by === "restaurant" ? "le restaurateur" : "la plateforme"} · {c.record.band === "free" ? "sans frais" : c.record.band === "half" ? "la moitié est due" : "tout est dû"} · {c.record.reason}
                  </p>
                  <p className="text-xs text-gray-500">
                    Payé {formatEuros(c.record.paidCents)} · acompte reçu {formatEuros(c.record.depositCents)} · retenu {formatEuros(c.record.retainedCents)} · au prestataire {formatEuros(c.record.providerPayoutCents)}
                  </p>
                  <p className="text-sm font-semibold text-amber-800">{describeSettlement(c.record.settlement, formatEuros)}</p>
                  {c.record.sanction !== "none" && <p className="text-xs text-red-700">Sanction du prestataire : {sanctionLabel(c.record.sanction)}</p>}
                </div>
                <SettleButton missionId={c.id} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {quoted.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold">Devis en attente d&apos;un oui</h2>
          <p className="text-xs text-gray-500">
            Pilote, avant Stripe : quand le restaurateur te dit oui et que l&apos;acompte est convenu, enregistre l&apos;acceptation. Il pourra alors choisir sa date.
          </p>
          <ul className="space-y-3">
            {quoted.map((m) => (
              <li key={m.id} className={`${CARD} p-5 flex items-start justify-between gap-3 flex-wrap`}>
                <div className="min-w-0">
                  <p className="font-semibold">
                    {m.restaurant_name} <span className="text-gray-500 font-normal">· {m.provider_name}</span>
                  </p>
                  <p className="text-xs text-gray-500">
                    Devis {formatEuros(m.price_cents)} · il paie {formatEuros(m.paid_cents)} (plan {m.plan}) · acompte {formatEuros(m.deposit_cents)}
                  </p>
                </div>
                <AcceptQuoteButton missionId={m.id} deposit={formatEuros(m.deposit_cents)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-semibold">Les prestataires</h2>
        {!result.ok ? (
          <p className={`${CARD} p-5 text-sm text-gray-500`}>
            Le module n&apos;est pas encore disponible : applique les migrations <code>20261009-1030-prestataires-schema</code>, <code>20261009-1500-prestataires-invitations</code>, <code>20261012-1000-prestataires-disponibilites</code>, <code>20261012-1100-prestataires-rappels</code>, <code>20261012-1200-prestataires-jour-j</code>, <code>20261012-1300-prestataires-retouches</code> et <code>20261013-1000-prestataires-annulations</code>.
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
