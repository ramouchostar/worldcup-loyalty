import { Check, ExternalLink, Star, X } from "lucide-react";
import { Card, SectionLabel } from "@/components/admin/ui";
import { EMPTY_PROFILE, isProfileEmpty, type ProviderProfile } from "@/lib/provider-profile";
import type { ReviewSummary } from "@/lib/mission-reviews";

// ADR 0084 §2 bis — « À propos du prestataire » : ce que le restaurateur lit avant de lui confier un brief.
// Sans état : le même rendu sert l'aperçu du prestataire (« Voir comme un restaurateur ») et la page de la mission.
// Les liens sont des exemples de travaux choisis par le prestataire : ouverts dans un autre onglet, sans transmettre la page d'origine.
export function ProviderProfileCard({ name, profile, reviews }: { name: string; profile: ProviderProfile | null; reviews?: ReviewSummary | null }) {
  const hasReviews = !!reviews && (reviews.shownAverage || reviews.comments.length > 0);
  if ((isProfileEmpty(profile) || !profile) && !hasReviews) return null;
  const p = profile ?? EMPTY_PROFILE;
  return (
    <Card className="space-y-4">
      <div>
        <SectionLabel>À propos du prestataire</SectionLabel>
        <p className="font-display text-[18px] font-bold tracking-[-0.02em] text-ink mt-1">{name}</p>
        {p.bio && <p className="text-[14px] text-ink mt-1 whitespace-pre-line">{p.bio}</p>}
      </div>

      {reviews && reviews.shownAverage && reviews.average !== null && (
        <p className="flex items-center gap-1.5 text-[14px] text-ink">
          <Star className="w-4 h-4 fill-ink text-ink" aria-hidden />
          <strong className="tabular-nums">{String(reviews.average).replace(".", ",")}</strong> sur 5 · {reviews.count} avis
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
              <p className="text-[12px] font-semibold text-ink-muted mb-1.5">Ce qu&apos;il fait</p>
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
              <p className="text-[12px] font-semibold text-ink-muted mb-1.5">Ce qu&apos;il ne fait pas</p>
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
          {p.equipment && <Fact label="Matériel" value={p.equipment} />}
          {p.zone && <Fact label="Zone" value={p.zone} />}
          {p.languages.length > 0 && <Fact label="Langues" value={p.languages.join(", ")} />}
        </dl>
      )}

      {p.works.length > 0 && (
        <div>
          <p className="text-[12px] font-semibold text-ink-muted mb-1.5">Exemples de travaux</p>
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
