import Link from "next/link";
import type { Metadata } from "next";
import { LogOut } from "lucide-react";
import { requireProviderPage } from "@/lib/providers";
import { getProviderLocale } from "@/lib/provider-locale";
import { messagesFor, makeTranslator } from "@/lib/i18n";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { LanguageSelect } from "@/components/i18n/LanguageSelect";

export const metadata: Metadata = { title: "Espace prestataire — Boosteats", robots: { index: false } };
export const dynamic = "force-dynamic";

// ADR 0084 — l'espace du prestataire. Un seul garde pour toutes ses pages :
// compte connecté ET prestataire ACTIF (un compte suspendu ou exclu est refusé
// ici, pas seulement par le middleware). Mobile d'abord : le prestataire
// ouvre un brief entre deux tournages.
// ADR 0084 §5 terdecies — l'espace est dans la langue du prestataire (français, néerlandais, anglais) ; le fournisseur de langue ci-dessous
// la donne aux composants client, les pages serveur la relisent par `getProviderLocale`.
export default async function ProviderLayout({ children }: { children: React.ReactNode }) {
  const { provider } = await requireProviderPage();
  const locale = await getProviderLocale(provider.id);
  const messages = messagesFor(locale);
  const { t } = makeTranslator(locale, messages);
  const nav = [
    { href: "/prestataire", label: t("nav.missions") },
    { href: "/prestataire/revenus", label: t("nav.revenue") },
    { href: "/prestataire/profil", label: t("nav.profile") },
    { href: "/prestataire/disponibilites", label: t("nav.availability") },
  ];

  return (
    <I18nProvider locale={locale} messages={messages}>
      <div lang={locale} className="min-h-screen bg-paper text-ink">
        <header className="bg-boost-night text-white">
          <div className="mx-auto max-w-3xl px-4 py-3 flex items-center gap-3">
            <Link href="/prestataire" className="min-w-0 flex-1">
              <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-white/60">{t("shell.brand")}</p>
              <p className="font-display text-[17px] font-bold tracking-[-0.02em] truncate">{provider.display_name}</p>
            </Link>
            <LanguageSelect current={locale} endpoint="/api/prestataire/langue" tone="dark" />
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-lg text-[13px] text-white/80 hover:text-white hover:bg-white/10">
                <LogOut className="w-4 h-4" aria-hidden /> {t("shell.logout")}
              </button>
            </form>
          </div>
          <nav aria-label={t("shell.nav.label")} className="mx-auto max-w-3xl px-4 flex gap-1 overflow-x-auto">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className="inline-flex items-center min-h-[44px] px-3 text-[13.5px] font-semibold text-white/80 hover:text-white whitespace-nowrap">
                {n.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
      </div>
    </I18nProvider>
  );
}
