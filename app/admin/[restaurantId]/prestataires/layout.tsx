import { createServerSupabaseClient } from "@/lib/supabase";
import { getUserLocale } from "@/lib/user-locale";
import { messagesFor } from "@/lib/i18n";
import { I18nProvider } from "@/components/i18n/I18nProvider";
import { LanguageSelect } from "@/components/i18n/LanguageSelect";

// ADR 0084 §5 terdecies — les pages « Prestataires » du restaurateur parlent SA langue (profil), le reste de la console reste en français.
// Le fournisseur de langue ci-dessous la donne aux composants client (dont les cartes partagées avec le prestataire) ; les pages serveur la relisent par `getUserLocale`.
export default async function PrestatairesLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const locale = user ? await getUserLocale(user.id) : "fr";
  return (
    <I18nProvider locale={locale} messages={messagesFor(locale)}>
      <div lang={locale}>
        {user && (
          <div className="flex justify-end max-w-2xl">
            <LanguageSelect current={locale} endpoint="/api/admin/langue" tone="light" />
          </div>
        )}
        {children}
      </div>
    </I18nProvider>
  );
}
