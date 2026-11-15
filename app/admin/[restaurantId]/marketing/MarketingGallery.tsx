"use client";

import Link from "next/link";
import { useState } from "react";
import { Camera, Smartphone, Star } from "@/components/icons";

// La galerie « Lancer une action » de l'espace Marketing (ADR 0104 §1) : une tuile par action,
// une image, un nom simple, ce qu'elle touche et ce qu'elle coûte, un appui pour démarrer.
// Toute nouvelle fonction marketing arrive ici comme une tuile. Une tuile fermée (forfait,
// drapeau) dit pourquoi, jamais un lien vers un 404.

export type GalleryCategory = "venir" | "revenir" | "contenu" | "google";

export type GalleryTile = {
  id: string;
  category: GalleryCategory;
  wide?: boolean;
  /** Une image (photo d'illustration, ou le visuel de la dernière pub) ; sinon une icône. */
  image: string | null;
  icon?: "star" | "phone" | "camera";
  badge?: string;
  title: string;
  text: string;
  facts: string[];
  /** null = action fermée pour cet établissement. */
  href: string | null;
  closedNote?: string;
};

const FILTERS: { id: "tout" | GalleryCategory; label: string }[] = [
  { id: "tout", label: "Tout" },
  { id: "venir", label: "Faire venir" },
  { id: "revenir", label: "Faire revenir" },
  { id: "contenu", label: "Photos et vidéos" },
  { id: "google", label: "Google" },
];

const ICONS = { star: Star, phone: Smartphone, camera: Camera };

export function MarketingGallery({ tiles }: { tiles: GalleryTile[] }) {
  const [filter, setFilter] = useState<"tout" | GalleryCategory>("tout");
  const shown = tiles.filter((t) => filter === "tout" || t.category === filter);
  return (
    <div className="space-y-3">
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Filtrer les actions">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`min-h-[36px] shrink-0 rounded-full border px-3.5 text-[13px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-boost-olive ${
              filter === f.id ? "border-ink bg-ink text-white" : "border-paper-border bg-white text-ink-body hover:border-ink-faint"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {shown.map((t) => (
          <Tile key={t.id} t={t} wide={!!t.wide && filter === "tout"} />
        ))}
      </div>
    </div>
  );
}

function Tile({ t, wide }: { t: GalleryTile; wide: boolean }) {
  const Icon = t.icon ? ICONS[t.icon] : null;
  const body = (
    <>
      <div className={`relative w-full overflow-hidden ${wide ? "aspect-[2/1]" : "aspect-square"} ${t.image ? "bg-paper-subtle" : "bg-boost-cream"}`}>
        {t.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.image} alt="" className={`h-full w-full object-cover ${t.href ? "" : "opacity-60"}`} loading="lazy" />
        ) : (
          Icon && (
            <div className="flex h-full w-full items-center justify-center">
              <Icon size={40} aria-hidden="true" className="text-boost-olive-dark" />
            </div>
          )
        )}
        {t.badge && (
          <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[13px] font-medium ${t.badge === "Conseillé" ? "bg-boost-olive text-white" : "bg-white text-ink"}`}>
            {t.badge}
          </span>
        )}
      </div>
      <div className="space-y-0.5 p-2.5">
        <p className="text-[15px] font-semibold leading-snug text-ink">{t.title}</p>
        <p className="text-[13px] leading-snug text-ink-muted">{t.href ? t.text : t.closedNote ?? t.text}</p>
        {t.facts.length > 0 && t.href && (
          <p className="flex flex-wrap gap-x-2.5 pt-1 text-[13px] font-semibold text-ink-body">
            {t.facts.map((f) => (
              <span key={f}>{f}</span>
            ))}
          </p>
        )}
      </div>
    </>
  );
  const cls = `flex flex-col overflow-hidden rounded-lg border border-paper-border bg-white text-left ${wide ? "col-span-2" : ""}`;
  if (!t.href) return <div className={cls} aria-disabled="true">{body}</div>;
  return (
    <Link
      href={t.href}
      className={`${cls} hover:border-boost-olive active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-boost-olive`}
    >
      {body}
    </Link>
  );
}
