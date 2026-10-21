import { Check, ExternalLink, X } from "lucide-react";
import { Card, SectionLabel } from "@/components/admin/ui";
import { isProfileEmpty, type ProviderProfile } from "@/lib/provider-profile";

// ADR 0084 §2 bis — « À propos du prestataire » : ce que le restaurateur lit avant de lui confier un brief.
// Sans état : le même rendu sert l'aperçu du prestataire (« Voir comme un restaurateur ») et la page de la mission.
// Les liens sont des exemples de travaux choisis par le prestataire : ouverts dans un autre onglet, sans transmettre la page d'origine.
export function ProviderProfileCard({ name, profile }: { name: string; profile: ProviderProfile | null }) {
  if (isProfileEmpty(profile) || !profile) return null;
  return (
    <Card className="space-y-4">
      <div>
        <SectionLabel>À propos du prestataire</SectionLabel>
        <p className="font-display text-[18px] font-bold tracking-[-0.02em] text-ink mt-1">{name}</p>
        {profile.bio && <p className="text-[14px] text-ink mt-1 whitespace-pre-line">{profile.bio}</p>}
      </div>

      {(profile.does.length > 0 || profile.doesNot.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {profile.does.length > 0 && (
            <div>
              <p className="text-[12px] font-semibold text-ink-muted mb-1.5">Ce qu&apos;il fait</p>
              <ul className="space-y-1">
                {profile.does.map((t) => (
                  <li key={t} className="flex items-start gap-1.5 text-[13.5px] text-ink">
                    <Check className="w-4 h-4 mt-0.5 shrink-0 text-good" aria-hidden /> {t}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {profile.doesNot.length > 0 && (
            <div>
              <p className="text-[12px] font-semibold text-ink-muted mb-1.5">Ce qu&apos;il ne fait pas</p>
              <ul className="space-y-1">
                {profile.doesNot.map((t) => (
                  <li key={t} className="flex items-start gap-1.5 text-[13.5px] text-ink">
                    <X className="w-4 h-4 mt-0.5 shrink-0 text-ink-muted" aria-hidden /> {t}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {(profile.equipment || profile.zone || profile.languages.length > 0) && (
        <dl className="grid gap-2 text-[13.5px]">
          {profile.equipment && <Fact label="Matériel" value={profile.equipment} />}
          {profile.zone && <Fact label="Zone" value={profile.zone} />}
          {profile.languages.length > 0 && <Fact label="Langues" value={profile.languages.join(", ")} />}
        </dl>
      )}

      {profile.works.length > 0 && (
        <div>
          <p className="text-[12px] font-semibold text-ink-muted mb-1.5">Exemples de travaux</p>
          <ul className="space-y-1">
            {profile.works.map((w) => (
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
