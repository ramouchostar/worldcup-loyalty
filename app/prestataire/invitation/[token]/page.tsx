import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase";
import { loadProviderInvite } from "@/lib/providers";
import { acceptProviderInvite, dismissProviderInvite } from "./actions";
import { getProviderLocale } from "@/lib/provider-locale";
import { LOCALES, LOCALE_LABEL, getT, isLocale, type Locale, type MessageKey, type Translator } from "@/lib/i18n";
import { fr } from "@/lib/i18n/messages/fr";

// ADR 0084 — page d'atterrissage du lien d'invitation prestataire. Publique à dessein : le
// prestataire n'a pas encore de compte quand il clique. Le middleware mémorise le token dans un
// cookie httpOnly pour le ramener ici après inscription ou connexion.
export const dynamic = "force-dynamic";

// Le sélecteur de langue de cette page publique : de simples liens (le prestataire n'a pas encore de compte, donc pas de langue enregistrée).
function Shell({ children, token, locale, tr }: { children: React.ReactNode; token: string; locale: Locale; tr: Translator }) {
  return (
    <div lang={locale} className="min-h-screen bg-paper flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl border border-paper-border p-6 space-y-4">
        {children}
        <nav aria-label={tr.t("invite.lang")} className="flex justify-center gap-3 text-[12.5px] text-ink-muted pt-2">
          {LOCALES.map((l) => (
            <Link key={l} href={`/prestataire/invitation/${token}?lang=${l}`} aria-current={l === locale ? "true" : undefined} className={`underline underline-offset-2 min-h-[44px] inline-flex items-center ${l === locale ? "font-semibold text-ink" : ""}`}>
              {LOCALE_LABEL[l]}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

function DeadEnd({ title, message, token, locale, tr }: { title: string; message: string; token: string; locale: Locale; tr: Translator }) {
  return (
    <Shell token={token} locale={locale} tr={tr}>
      <h1 className="font-display text-[22px] font-bold tracking-[-0.02em] text-ink">{title}</h1>
      <p className="text-[14px] text-ink-muted">{message}</p>
      <Link href="/" className="block text-center border border-paper-border text-ink py-3 rounded-xl font-semibold text-[14px] min-h-[44px]">
        {tr.t("invite.home")}
      </Link>
    </Shell>
  );
}

export default async function ProviderInvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string; lang?: string }>;
}) {
  const { token } = await params;
  const { error, lang } = await searchParams;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Le lien est jugé avec l'adresse du compte connecté : une invitation transférée à quelqu'un
  // d'autre est refusée avant même de proposer le bouton.
  const { state, invite } = await loadProviderInvite(token, user ? (user.email ?? "") : undefined);

  // La langue : celle choisie sur cette page (?lang=), sinon celle fixée par la plateforme pour ce prestataire, sinon le français.
  const locale: Locale = isLocale(lang) ? lang : invite ? await getProviderLocale(invite.providerId) : "fr";
  const tr = getT(locale);
  const { t } = tr;

  if (state === "not-found" || !invite) {
    return <DeadEnd tr={tr} token={token} locale={locale} title={t("invite.notFound.title")} message={t("invite.notFound.body")} />;
  }

  if (state === "revoked" || state === "expired") {
    return <DeadEnd tr={tr} token={token} locale={locale} title={state === "expired" ? t("invite.expired.title") : t("invite.revoked.title")} message={t("invite.gone.body")} />;
  }

  if (state === "accepted") {
    return (
      <Shell token={token} locale={locale} tr={tr}>
        <h1 className="font-display text-[22px] font-bold tracking-[-0.02em] text-ink">{t("invite.accepted.title")}</h1>
        <p className="text-[14px] text-ink-muted">{t("invite.accepted.body")}</p>
        <Link href="/prestataire" className="block text-center bg-boost-olive text-white py-3 rounded-xl font-semibold text-[14px] min-h-[44px]">
          {t("invite.accepted.open")}
        </Link>
      </Shell>
    );
  }

  const email = invite.email;

  if (!user) {
    return (
      <Shell token={token} locale={locale} tr={tr}>
        <h1 className="font-display text-[22px] font-bold tracking-[-0.02em] text-ink">{t("invite.welcome", { name: invite.providerName })}</h1>
        <p className="text-[14px] text-ink-muted">{t("invite.welcome.body")}</p>
        <p className="text-[14px] text-ink font-semibold">{t("invite.welcome.email", { email })}</p>
        <Link href="/login" className="block text-center bg-boost-olive text-white py-3 rounded-xl font-semibold text-[14px] min-h-[44px]">
          {t("invite.welcome.login")}
        </Link>
        <p className="text-[12.5px] text-ink-faint">{t("invite.welcome.return")}</p>
      </Shell>
    );
  }

  if (state === "email-mismatch") {
    return (
      <Shell token={token} locale={locale} tr={tr}>
        <h1 className="font-display text-[22px] font-bold tracking-[-0.02em] text-ink">{t("invite.mismatch.title")}</h1>
        <p className="text-[14px] text-ink-muted">{t("invite.mismatch.body", { email })}</p>
        <form action="/api/auth/logout" method="post">
          <button type="submit" className="w-full border border-paper-border text-ink py-3 rounded-xl font-semibold text-[14px] min-h-[44px]">
            {t("invite.mismatch.logout")}
          </button>
        </form>
      </Shell>
    );
  }

  return (
    <Shell token={token} locale={locale} tr={tr}>
      <h1 className="font-display text-[22px] font-bold tracking-[-0.02em] text-ink">{t("invite.activate.title")}</h1>
      <p className="text-[14px] text-ink-muted">{t("invite.activate.body", { name: invite.providerName, email })}</p>
      {error && `invite.error.${error}` in fr && (
        <p role="alert" className="text-danger text-[13.5px] font-semibold">
          {t(`invite.error.${error}` as MessageKey)}
        </p>
      )}
      <form action={acceptProviderInvite.bind(null, token)}>
        <button type="submit" className="w-full bg-boost-olive text-white py-3 rounded-xl font-semibold text-[14px] min-h-[44px] shadow-[inset_0_-3px_0_#4F5C2D]">
          {t("invite.activate.button")}
        </button>
      </form>
      <form action={dismissProviderInvite}>
        <button type="submit" className="w-full text-[13px] text-ink-muted underline underline-offset-2 min-h-[44px]">
          {t("invite.activate.later")}
        </button>
      </form>
    </Shell>
  );
}
