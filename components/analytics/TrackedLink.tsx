"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { track, type Audience } from "@/lib/analytics";

type Props = ComponentProps<typeof Link> & {
  /** Identifiant stable du CTA — ne pas renommer une fois en production. */
  ctaId: string;
  /** Section de la page où il se trouve (hero, plans, footer…). */
  ctaLocation: string;
  audience?: Audience;
};

/**
 * `<Link>` qui émet `cta_clicked` avant de naviguer.
 *
 * Un `<Link>` nu et un `<TrackedLink>` doivent rester interchangeables : mêmes
 * props, même rendu, aucune classe imposée. C'est ce qui permet d'instrumenter
 * une landing sans toucher à sa mise en page.
 *
 * `ctaId` est la clé d'analyse dans GA4 : le garder stable dans le temps, même
 * si le libellé du bouton change — sinon la série temporelle se coupe en deux.
 */
export function TrackedLink({
  ctaId,
  ctaLocation,
  audience = "public",
  onClick,
  children,
  ...linkProps
}: Props) {
  return (
    <Link
      {...linkProps}
      onClick={(event) => {
        track("cta_clicked", { cta_id: ctaId, cta_location: ctaLocation, audience });
        onClick?.(event);
      }}
    >
      {children}
    </Link>
  );
}
