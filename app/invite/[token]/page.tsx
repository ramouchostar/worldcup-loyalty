import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { loadOwnerInvite } from "@/lib/owner-invites";
import { isRestaurantAdminSeat, ADMIN_ROLE_LABELS } from "@/lib/restaurant-admins";
import { acceptInvite, dismissInvite } from "./actions";

// ADR 0032 — page d'atterrissage du lien d'invitation restaurateur. Publique à
// dessein : le restaurateur n'a pas encore de compte quand il clique. Le
// middleware mémorise le token dans un cookie httpOnly avant de le laisser
// passer, pour le ramener ici après inscription ou connexion.
export const dynamic = "force-dynamic";

const ERROR_LABELS: Record<string, string> = {
  expired: "Ce lien a expiré.",
  accepted: "Ce lien a déjà été utilisé.",
  revoked: "Ce lien a été désactivé.",
  "not-found": "Ce lien n'est pas valide.",
  error: "L'activation a échoué. Réessaie dans un instant.",
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
        {children}
      </div>
    </div>
  );
}

function DeadEnd({ title, message }: { title: string; message: string }) {
  return (
    <Shell>
      <p className="text-4xl text-center">🔒</p>
      <h1 className="text-xl font-bold text-gray-900 text-center">{title}</h1>
      <p className="text-sm text-gray-500 text-center">{message}</p>
      <Link
        href="/"
        className="block text-center bg-gray-100 text-gray-700 py-2.5 rounded-lg font-semibold text-sm hover:bg-gray-200 transition-colors"
      >
        Retour à l&apos;accueil
      </Link>
    </Shell>
  );
}

export default async function OwnerInvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;
  const { state, invite } = await loadOwnerInvite(token);

  if (state === "not-found" || !invite) {
    return (
      <DeadEnd
        title="Lien introuvable"
        message="Ce lien d'invitation n'existe pas ou a été remplacé. Demande-en un nouveau à ton contact Boosteats."
      />
    );
  }

  if (state === "revoked" || state === "expired") {
    return (
      <DeadEnd
        title={state === "expired" ? "Lien expiré" : "Lien désactivé"}
        message={`L'invitation pour ${invite.restaurantName} n'est plus valable. Demande un nouveau lien à ton contact Boosteats — cela prend dix secondes.`}
      />
    );
  }

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Lien déjà consommé : si c'est CE compte qui l'a consommé, on ne dit pas
  // « déjà utilisé » (le restaurateur a juste rouvert son lien) — on l'envoie
  // sur sa console. ADR 0040 — comparer au siège (pas seulement owner_id) :
  // un manager ou un siège équipe qui rouvre son lien accepté n'est jamais
  // devenu owner_id, mais a bien un accès actif.
  if (state === "accepted") {
    if (user) {
      if (await isRestaurantAdminSeat(user.id, invite.restaurantId)) {
        return (
          <Shell>
            <p className="text-4xl text-center">✅</p>
            <h1 className="text-xl font-bold text-gray-900 text-center">
              {invite.restaurantName} est déjà à toi
            </h1>
            <p className="text-sm text-gray-500 text-center">
              Ton accès restaurateur est actif. Tout se passe désormais dans ta console.
            </p>
            <Link
              href={`/admin/${invite.restaurantId}`}
              className="block text-center bg-brand-dark text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-gray-800 transition-colors"
            >
              Ouvrir ma console →
            </Link>
          </Shell>
        );
      }
    }
    return (
      <DeadEnd
        title="Lien déjà utilisé"
        message={`L'accès restaurateur de ${invite.restaurantName} a déjà été activé avec ce lien. Si ce n'était pas toi, contacte Boosteats.`}
      />
    );
  }

  // ── Invitation valide ────────────────────────────────────────────────────

  const intro = (
    <>
      <p className="text-4xl text-center">🔑</p>
      <h1 className="text-xl font-bold text-gray-900 text-center">
        Espace restaurateur — {invite.restaurantName}
      </h1>
      <p className="text-sm text-gray-500 text-center">
        Ce lien te donne la main sur la console de ton établissement : catalogue,
        cadeaux, QR code des tables et suivi de tes commandes directes.
      </p>
      <p className="text-xs text-gray-400 text-center">
        Rôle proposé : <span className="font-semibold text-gray-600">{ADMIN_ROLE_LABELS[invite.role]}</span>
      </p>
      {error && ERROR_LABELS[error] && (
        <p className="text-sm text-red-600 text-center">{ERROR_LABELS[error]}</p>
      )}
    </>
  );

  if (!user) {
    // Le cookie posé par le middleware ramènera ici après l'inscription ou la
    // connexion — inutile de trimballer le token dans les URLs.
    return (
      <Shell>
        {intro}
        <Link
          href="/signup"
          className="block text-center bg-brand-red text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-red-700 transition-colors"
        >
          Créer mon compte
        </Link>
        <Link
          href="/login"
          className="block text-center bg-gray-100 text-gray-700 py-2.5 rounded-lg font-semibold text-sm hover:bg-gray-200 transition-colors"
        >
          J&apos;ai déjà un compte
        </Link>
        <p className="text-xs text-gray-400 text-center">
          On te ramène automatiquement ici une fois connecté.
        </p>
      </Shell>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  if (!profile?.display_name) {
    return (
      <Shell>
        {intro}
        <p className="text-sm text-gray-500 text-center">
          Il te reste à compléter ton profil (prénom, zone) — une minute, puis tu
          reviens ici.
        </p>
        <Link
          href="/register"
          className="block text-center bg-brand-red text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-red-700 transition-colors"
        >
          Compléter mon inscription
        </Link>
      </Shell>
    );
  }

  return (
    <Shell>
      {intro}
      <form action={acceptInvite.bind(null, token)}>
        <button
          type="submit"
          className="w-full bg-brand-red text-white py-3 rounded-lg font-bold text-sm hover:bg-red-700 transition-colors"
        >
          Activer mon espace restaurateur
        </button>
      </form>
      <div className="text-xs text-gray-400 text-center">
        Connecté en tant que <span className="font-semibold">{user.email}</span>.
        {" "}Ce n&apos;est pas le bon compte ?{" "}
        <form action="/api/auth/logout" method="POST" className="inline">
          <button type="submit" className="underline hover:text-gray-600">
            Se déconnecter
          </button>
        </form>
      </div>
      <form action={dismissInvite}>
        <button
          type="submit"
          className="w-full text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          Pas maintenant
        </button>
      </form>
    </Shell>
  );
}
