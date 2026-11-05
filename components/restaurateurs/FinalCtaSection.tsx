"use client";

import { TrackedLink } from "@/components/analytics/TrackedLink";
import { RestaurantSearchBar } from "@/components/audit-gratuit/RestaurantSearchBar";
import { WHATSAPP_NUMBER_DISPLAY, whatsappUrl } from "@/lib/contact";
import { PHOTOS } from "./IPhone";

// Appel final (maquette du 2026-11-04), au style de la maquette : photo de salle
// assombrie, l'analyse gratuite en principal (ADR 0071), puis le Gratuit et
// WhatsApp (décision du 2026-11-01). Crédit des photos sous le bloc.
export function FinalCtaSection() {
  return (
    <section className="bx-sec bx-x" style={{ paddingTop: 0 }}>
      <div className="bx-wrap">
        <div className="bx-final">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="bx-bgimg" src={PHOTOS.salle} alt="" aria-hidden loading="lazy" />
          <h2>Prêt à faire monter votre chiffre d&apos;affaires ?</h2>
          <p className="bx-sub">On commence par regarder votre restaurant. Gratuit, en moins d&apos;une minute.</p>
          <div className="bx-search">
            <RestaurantSearchBar location="cta_final" />
          </div>
          <p className="bx-links">
            <TrackedLink ctaId="devenir_partenaire" ctaLocation="cta_final" audience="restaurateur" href="/become-a-partner">
              Ou commencer gratuitement
            </TrackedLink>
          </p>
          <p className="bx-links">
            Une question avant de démarrer ? WhatsApp{" "}
            <TrackedLink ctaId="whatsapp" ctaLocation="cta_final" audience="restaurateur" href={whatsappUrl()}>
              {WHATSAPP_NUMBER_DISPLAY}
            </TrackedLink>{" "}
            ou <a href="mailto:contact@boosteats.be">contact@boosteats.be</a>.
          </p>
        </div>
        <p className="bx-credits">Photos : Belchicken, Unsplash (licence libre) et images d&apos;illustration. Personnages fictifs, créés pour Boosteats.</p>
      </div>
    </section>
  );
}
