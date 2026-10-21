import { Check, ExternalLink, Star, X } from "lucide-react";
import { Card, SectionLabel } from "@/components/admin/ui";
import { EMPTY_PROFILE, isProfileEmpty, type ProviderProfile } from "@/lib/provider-profile";
import type { ReviewSummary } from "@/lib/mission-reviews";
import { makeTranslator, type Translator } from "@/lib/i18n/core";
import { fr } from "@/lib/i18n/messages/fr";

// ADR 0084 §2 bis — « À propos du prestataire » : ce que le restaurateur lit avant de lui confier un brief.
// Sans état : le même rendu sert l'aperçu du prestataire (« Voir comme un restaurateur ») et la page de la mission.
// Les liens sont des exemples de travaux choisis par le prestataire : ouverts dans un autre onglet, sans transmettre la page d'origine.
const FR = makeTranslator("fr", fr);

// `tr` : la langue de celui qui lit (le restaurateur) ; sans elle, le français.
export function ProviderProfileCard({ name, profile, reviews, tr = FR }: { name: string; profile: ProviderProfile | null; reviews?: ReviewSummary | null; tr?: Translator }) {
  const { t, locale } = tr;
  const hasReviews = !!reviews && (reviews.shownAverage || reviews.comments.length > 0);
  if ((isProfileEmpty(profile) || !profile) && !hasReviews) return null;
  const p = profile ?? EMPTY_PROFILE;
  return (
    <Card className="space-y-4">
      <div>
        <SectionLabel>{t("card.title")}</SectionLabel>
        <p className="font-display text-[18px] font-bold tracking-[-0.02em] text-ink mt-1">{name}</p>
        {p.bio && <p className="text-[14px] text-ink mt-1 whitespace-pre-line">{p.bio}</p>}
      </div>

      {reviews && reviews.shownAverage && reviews.average !== null && (
        <p className="flex items-center gap-1.5 text-[14px] text-ink">
          <Star className="w-4 h-4 fill-ink text-ink" aria-hidden />
          {t("card.rating", { avg: String(reviews.average).replace(".", locale === "en" ? "." : ","), count: reviews.count })}
        </p>
      )}
      {reviews && reviews.comments.length > 0 && (
        <ul className="space-y-1.5">
          {reviews.comments.map((c) => (
            <li key={`${c.at}|${c.comment}`} className="text-[13.5px] text-ink">
              <span className="text-ink-muted tabular-nums">{c.rating}/5 · </span>«&nbsp;{c.comment}&nbsp;»
            </li>
          ))}
        </ul>
      )}

      {(p.does.length > 0 || p.doesNot.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {p.does.length > 0 && (
            <div>
              <p className="text-[12px] font-semibold text-ink-muted mb-1.5">{t("card.does")}</p>
              <ul className="space-y-1">
                {p.does.map((t) => (
                  <li key={t} className="flex items-start gap-1.5 text-[13.5px] text-ink">
                    <Check className="w-4 h-4 mt-0.5 shrink-0 text-good" aria-hidden /> {t}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {p.doesNot.length > 0 && (
            <div>
              <p className="text-[12px] font-semibold text-ink-muted mb-1.5">{t("card.doesNot")}</p>
              <ul className="space-y-1">
                {p.doesNot.map((t) => (
                  <li key={t} className="flex items-start gap-1.5 text-[13.5px] text-ink">
                    <X className="w-4 h-4 mt-0.5 shrink-0 text-ink-muted" aria-hidden /> {t}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {(p.equipment || p.zone || p.languages.length > 0) && (
        <dl className="grid gap-2 text-[13.5px]">
          {p.equipment && <Fact label={t("card.equipment")} value={p.equipment} />}
          {p.zone && <Fact label={t("card.zone")} value={p.zone} />}
          {p.languages.length > 0 && <Fact label={t("card.languages")} value={p.languages.map((l) => tr.canon("language", l)).join(", ")} />}
        </dl>
      )}

      {p.works.length > 0 && (
        <div>
          <p className="text-[12px] font-semibold text-ink-muted mb-1.5">{t("card.works")}</p>
          <ul className="space-y-1">
            {p.works.map((w) => (
              <li key={`${w.label}|${w.url}`}>
                <a href={w.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1.5 min-h-[44px] text-[13.5px] font-semibold text-ink underline underline-offset-2">
                  {w.label} <ExternalLink className="w-3.5 h-3.5" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-ink-muted">{label}</dt>
      <dd className="text-ink min-w-0">{value}</dd>
    </div>
  );
}
