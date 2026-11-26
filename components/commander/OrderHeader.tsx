import type { ReactNode } from "react";
import { Location, Star } from "@/components/icons";
import { ratingLabel, type FicheView } from "@/lib/site-orders/fiche";
import { OPENNESS_TITLE, opennessDetail, type Openness } from "@/lib/site-orders/hours";
import type { PublicRestaurant } from "@/lib/site-orders/menu";
import { accentFill, telHref } from "./ui";

// ADR 0108 §4 — l'en-tête de l'espace : le restaurant tel qu'il est en base (nom, logo, adresse, téléphone) et ce que sa
// fiche Google dit maintenant (ouvert ou fermé, note). Une information absente n'a pas de ligne.

const DOT: Record<Openness["state"], string> = { ouvert: "bg-good", ferme: "bg-danger", inconnu: "bg-ink-faint" };

// Le combiné n'est pas encore dans `components/icons` : le tracé est celui de la maquette.
const PhoneIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />
  </svg>
);

const Line = ({ icon, children }: { icon: ReactNode; children: ReactNode }) => (
  <li className="flex items-start gap-2.5">
    <span className="mt-px shrink-0 text-ink-muted">{icon}</span>
    <span className="min-w-0 break-words">{children}</span>
  </li>
);

/** La mention exigée par Google à côté de ce qui vient de sa fiche : le texte « Google Maps », jamais traduit ni coupé. */
function Attribution({ fiche }: { fiche: FicheView }) {
  const what = [fiche.openness.state === "inconnu" ? null : "Horaires", fiche.rating ? "note" : null].filter(Boolean).join(" et ");
  if (what === "") return null;
  return (
    <p className="text-[13px] text-ink-muted">
      {what.charAt(0).toUpperCase() + what.slice(1)} :{" "}
      <span translate="no" className="whitespace-nowrap font-normal tracking-normal text-[#5E5E5E]" style={{ fontFamily: "Roboto, Arial, sans-serif" }}>Google Maps</span>
      {fiche.attributions.map((a) => (
        <span key={a.provider}>
          , {a.url ? <a href={a.url} target="_blank" rel="noopener noreferrer" className="underline">{a.provider}</a> : a.provider}
        </span>
      ))}
    </p>
  );
}

type Props = {
  restaurant: PublicRestaurant;
  /** `undefined` : la fiche se lit ; `null` : pas de réponse (rien n'est affirmé). */
  fiche: FicheView | null | undefined;
  openness: Openness | null;
  now: Date;
};

export function OrderHeader({ restaurant, fiche, openness, now }: Props) {
  const detail = openness ? (openness.state === "inconnu" ? "appelle le restaurant" : opennessDetail(openness, now)) : null;
  return (
    <header className="border-b border-paper-border">
      <div className="mx-auto flex max-w-2xl flex-col gap-3.5 px-4 pb-4 pt-5 lg:max-w-[1140px] lg:flex-row lg:items-start lg:justify-between lg:gap-8 lg:px-5 lg:pb-6 lg:pt-7">
        <div className="flex min-w-0 items-center gap-3 lg:gap-4">
          {restaurant.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={restaurant.logoUrl} alt="" className="h-12 w-12 shrink-0 rounded-full border border-paper-border bg-white object-contain lg:h-16 lg:w-16" />
          ) : (
            <span aria-hidden="true" className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[20px] font-semibold lg:h-16 lg:w-16 lg:text-[24px] ${accentFill}`}>
              {restaurant.name.trim().charAt(0).toLocaleUpperCase("fr-BE")}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="break-words text-[20px] font-semibold leading-tight text-ink lg:text-[32px]">{restaurant.name}</h1>
            <p className="mt-0.5 break-words text-[13px] text-ink-muted lg:mt-1 lg:text-[15px]">{restaurant.cuisine ? `${restaurant.cuisine}, à emporter` : "À emporter"}</p>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-3.5 text-[15px] text-ink empty:hidden lg:w-[400px] lg:shrink-0 lg:gap-2">
          {openness ? (
            <p role="status" className="flex flex-wrap items-center gap-x-2">
              <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[openness.state]}`} />
              <span className="font-semibold">{OPENNESS_TITLE[openness.state]}</span>
              {detail && <span className="text-ink-muted">{detail}</span>}
            </p>
          ) : fiche === undefined ? (
            <p className="text-ink-muted">Lecture des horaires…</p>
          ) : null}
          {(restaurant.address || restaurant.phone || fiche?.rating) && (
            <ul className="flex flex-col gap-2.5 lg:gap-2">
              {restaurant.address && <Line icon={<Location size={20} />}>{restaurant.address}</Line>}
              {restaurant.phone && (
                <Line icon={<PhoneIcon />}>
                  <a href={telHref(restaurant.phone)} className="-my-3 inline-block py-3 underline-offset-2 hover:underline">{restaurant.phone}</a>
                </Line>
              )}
              {fiche?.rating && <Line icon={<Star size={20} />}>{ratingLabel(fiche.rating)}</Line>}
            </ul>
          )}
          {fiche && <Attribution fiche={fiche} />}
        </div>
      </div>
    </header>
  );
}
