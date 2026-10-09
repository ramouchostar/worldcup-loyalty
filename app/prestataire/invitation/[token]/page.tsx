import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { loadProviderInvite } from "@/lib/providers";
import { acceptProviderInvite, dismissProviderInvite } from "./actions";

// ADR 0084 — page d'atterrissage du lien d'invitation prestataire. Publique à dessein : le
// prestataire n'a pas encore de compte quand il clique. Le middleware mémorise le token dans un
// cookie httpOnly pour le ramener ici après inscription ou connexion.
export const dynamic = "force-dynamic";

const ERROR_TEXT: Record<string, string> = {
  expired: "Ce lien a expiré.",
  accepted: "Ce lien a déjà été utilisé.",
  revoked: "Ce lien a été remplacé ou désactivé.",
  "not-found": "Ce lien n'est pas valide.",
  "email-mismatch": "Ce lien est lié à une autre adresse e-mail que celle de ton compte.",
  "already-provider": "Ce compte est déjà celui d'un prestataire.",
  error: "L'activation a échoué. Réessaie dans un instant.",
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl border border-paper-border p-6 space-y-4">{children}</div>
    </div>
  );
}

function DeadEnd({ title, message }: { title: string; message: string }) {
  return (
    <Shell>
      <h1 className="font-display text-[22px] font-bold tracking-[-0.02em] text-ink">{title}</h1>
      <p className="text-[14px] text-ink-muted">{message}</p>
      <Link href="/" className="block text-center border border-paper-border text-ink py-3 rounded-xl font-semibold text-[14px] min-h-[44px]">
        Retour à l&apos;accueil
      </Link>
    </Shell>
  );
}

export default async function ProviderInvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Le lien est jugé avec l'adresse du compte connecté : une invitation transférée à quelqu'un
  // d'autre est refusée avant même de proposer le bouton.
  const { state, invite } = await loadProviderInvite(token, user ? (user.email ?? "") : undefined);

  if (state === "not-found" || !invite) {
    return <DeadEnd title="Lien introuvable" message="Ce lien d'invitation n'existe pas ou a été remplacé. Demande-en un nouveau à ton contact Boosteats." />;
  }

  if (state === "revoked" || state === "expired") {
    return <DeadEnd title={state === "expired" ? "Lien expiré" : "Lien remplacé"} message="Cette invitation n'est plus valable. Demande un nouveau lien à ton contact Boosteats : cela prend dix secondes." />;
  }

  if (state === "accepted") {
    return (
      <Shell>
        <h1 className="font-display text-[22px] font-bold tracking-[-0.02em] text-ink">Ton espace est déjà actif</h1>
        <p className="text-[14px] text-ink-muted">Ce lien a déjà servi. Connecte-toi pour retrouver tes missions.</p>
        <Link href="/prestataire" className="block text-center bg-boost-olive text-white py-3 rounded-xl font-semibold text-[14px] min-h-[44px]">
          Ouvrir mon espace
        </Link>
      </Shell>
    );
  }

  const email = invite.email;

  if (!user) {
    return (
      <Shell>
        <h1 className="font-display text-[22px] font-bold tracking-[-0.02em] text-ink">Bienvenue {invite.providerName}</h1>
        <p className="text-[14px] text-ink-muted">
          Boosteats t&apos;invite à rejoindre ses prestataires : tu reçois des briefs complets de restaurateurs, tu chiffres, tu fixes ta date.
        </p>
        <p className="text-[14px] text-ink">
          Connecte-toi (ou crée ton compte) avec l&apos;adresse <span className="font-semibold">{email}</span> : ce lien lui est réservé.
        </p>
        <Link href="/login" className="block text-center bg-boost-olive text-white py-3 rounded-xl font-semibold text-[14px] min-h-[44px]">
          Se connecter ou créer mon compte
        </Link>
        <p className="text-[12.5px] text-ink-faint">Après ta connexion, tu reviens ici automatiquement.</p>
      </Shell>
    );
  }

  if (state === "email-mismatch") {
    return (
      <Shell>
        <h1 className="font-display text-[22px] font-bold tracking-[-0.02em] text-ink">Ce n&apos;est pas la bonne adresse</h1>
        <p className="text-[14px] text-ink-muted">
          Cette invitation est réservée à <span className="font-semibold text-ink">{email}</span>, et tu es connecté avec une autre adresse. Déconnecte-toi puis reviens sur ce lien avec la bonne.
        </p>
        <form action="/api/auth/logout" method="post">
          <button type="submit" className="w-full border border-paper-border text-ink py-3 rounded-xl font-semibold text-[14px] min-h-[44px]">
            Me déconnecter
          </button>
        </form>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="font-display text-[22px] font-bold tracking-[-0.02em] text-ink">Active ton espace prestataire</h1>
      <p className="text-[14px] text-ink-muted">
        {invite.providerName}, tu es connecté avec {email}. Un clic et tu retrouves tes briefs, tes devis et tes dates.
      </p>
      {error && ERROR_TEXT[error] && (
        <p role="alert" className="text-danger text-[13.5px] font-semibold">
          {ERROR_TEXT[error]}
        </p>
      )}
      <form action={acceptProviderInvite.bind(null, token)}>
        <button type="submit" className="w-full bg-boost-olive text-white py-3 rounded-xl font-semibold text-[14px] min-h-[44px] shadow-[inset_0_-3px_0_#4F5C2D]">
          Activer mon espace
        </button>
      </form>
      <form action={dismissProviderInvite}>
        <button type="submit" className="w-full text-[13px] text-ink-muted underline underline-offset-2 min-h-[44px]">
          Pas maintenant
        </button>
      </form>
    </Shell>
  );
}
