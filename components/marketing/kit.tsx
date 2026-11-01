import type { ReactNode } from "react";
import Link from "next/link";
import { Check, MessageCircle, X } from "lucide-react";
import { Header } from "@/components/restaurateurs/Header";
import { Footer } from "@/components/restaurateurs/Footer";
import { RestaurantSearchBar } from "@/components/audit-gratuit/RestaurantSearchBar";
import { TrackedLink } from "@/components/analytics/TrackedLink";
import { getMarketingPage } from "@/lib/marketing-pages";
import { WHATSAPP_NUMBER_DISPLAY, whatsappUrl } from "@/lib/contact";

// Boîte à outils des pages publiques (fonctions, analyses, blog). Chaque page
// compose SA mise en scène avec ces briques (retour de Mehdi du 2026-11-01 :
// des pages différentes, illustrées, pas un gabarit copié-collé).
// Couleurs du site vitrine : moss (accent), ink/paper (neutres), danger/good
// pour les mauvais/bons points (contraste AA mesuré, tailwind.config.ts).

export type Faq = { q: string; a: string };

/** En-tête, pied de page et FAQ en données structurées (schema.org FAQPage). */
export function MarketingShell({ children, faq }: { children: ReactNode; faq?: Faq[] }) {
  return (
    <div className="bg-paper min-h-screen flex flex-col">
      {faq && faq.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
            }),
          }}
        />
      )}
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

const TONES = {
  paper: "bg-paper",
  white: "bg-white border-y border-paper-border",
  tint: "bg-moss-tint",
  ink: "bg-ink text-white",
} as const;

export function Section({
  tone = "paper",
  children,
  className = "",
  id,
  width = "max-w-[1100px]",
}: {
  tone?: keyof typeof TONES;
  children: ReactNode;
  className?: string;
  id?: string;
  width?: string;
}) {
  return (
    <section id={id} className={TONES[tone]}>
      <div className={`${width} mx-auto px-5 sm:px-8 py-16 sm:py-20 ${className}`}>{children}</div>
    </section>
  );
}

export function Eyebrow({ children, onDark = false }: { children: ReactNode; onDark?: boolean }) {
  return (
    <p className={`text-[12.5px] font-bold uppercase tracking-[0.1em] ${onDark ? "text-moss-light" : "text-moss-dark"}`}>{children}</p>
  );
}

export function Heading({
  eyebrow,
  title,
  intro,
  onDark = false,
  center = false,
  as: Tag = "h2",
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  intro?: ReactNode;
  onDark?: boolean;
  center?: boolean;
  as?: "h1" | "h2";
}) {
  const size =
    Tag === "h1"
      ? "text-[36px] sm:text-[48px] lg:text-[58px] leading-[1.05] tracking-[-0.035em]"
      : "text-[28px] sm:text-[36px] leading-[1.15] tracking-[-0.025em]";
  return (
    <div className={center ? "text-center mx-auto max-w-[760px]" : "max-w-[760px]"}>
      {eyebrow && <Eyebrow onDark={onDark}>{eyebrow}</Eyebrow>}
      <Tag className={`font-display font-bold text-pretty mt-3 ${size} ${onDark ? "text-white" : "text-ink"}`}>{title}</Tag>
      {intro && (
        <p className={`font-landing text-[17px] leading-[1.7] mt-4 ${onDark ? "text-night-text" : "text-ink-muted"} ${center ? "mx-auto max-w-[640px]" : ""}`}>
          {intro}
        </p>
      )}
    </div>
  );
}

/** La recherche de l'établissement qui lance l'analyse gratuite (ADR 0071). */
export function SearchCard({ location }: { location: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-[0_16px_40px_rgba(10,10,10,0.12)] border border-paper-border p-2 text-left">
      <RestaurantSearchBar location={location} />
    </div>
  );
}

export function WhatsAppLink({
  location,
  label = "Nous écrire sur WhatsApp",
  message,
  variant = "outline",
}: {
  location: string;
  label?: string;
  message?: string;
  variant?: "outline" | "solid" | "text" | "onDark";
}) {
  const cls = {
    outline: "inline-flex items-center justify-center gap-2 border-[1.5px] border-ink/15 bg-white text-ink text-[15px] font-bold rounded-lg px-5 py-3 hover:border-good transition-colors",
    solid: "inline-flex items-center justify-center gap-2 bg-good text-white text-[15px] font-bold rounded-lg px-5 py-3 hover:opacity-90 transition-opacity",
    text: "inline-flex items-center gap-1.5 text-[15px] font-semibold text-good hover:underline",
    onDark: "inline-flex items-center justify-center gap-2 border-[1.5px] border-white/25 text-white text-[15px] font-bold rounded-lg px-5 py-3 hover:border-white/60 transition-colors",
  }[variant];
  return (
    <TrackedLink ctaId="whatsapp" ctaLocation={location} audience="restaurateur" href={whatsappUrl(message)} className={cls}>
      <MessageCircle className="w-4 h-4" strokeWidth={2.4} aria-hidden />
      {label}
    </TrackedLink>
  );
}

/** Le bloc d'appel à l'action de fin de page : analyse gratuite, puis WhatsApp. */
export function AnalysisCta({
  location,
  title = "Voyez où en est votre restaurant",
  body = "Fiche Google, avis, voisins : une note sur 100 en moins d'une minute. Gratuit, sans engagement.",
  whatsappMessage,
}: {
  location: string;
  title?: ReactNode;
  body?: ReactNode;
  whatsappMessage?: string;
}) {
  return (
    <section className="bg-ink">
      <div className="max-w-[880px] mx-auto px-5 sm:px-8 py-20 text-center">
        <h2 className="font-display text-[30px] sm:text-[40px] leading-[1.15] tracking-[-0.025em] font-bold text-white text-pretty">{title}</h2>
        <p className="font-landing text-[16.5px] leading-[1.7] text-night-text mt-4 max-w-[580px] mx-auto">{body}</p>
        <div className="mt-8 max-w-[640px] mx-auto">
          <SearchCard location={`${location}_bas`} />
        </div>
        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center items-center">
          <WhatsAppLink location={`${location}_bas`} variant="onDark" message={whatsappMessage} label={`WhatsApp : ${WHATSAPP_NUMBER_DISPLAY}`} />
          <TrackedLink
            ctaId="devenir_partenaire"
            ctaLocation={`${location}_bas`}
            audience="restaurateur"
            href="/become-a-partner"
            className="text-[15px] font-semibold text-moss-light hover:underline"
          >
            Ou commencer gratuitement →
          </TrackedLink>
        </div>
      </div>
    </section>
  );
}

/** Deux colonnes : ce qui fait fuir (rouge), ce qui fait entrer (vert). */
export function CompareColumns({
  badTitle,
  bad,
  goodTitle,
  good,
}: {
  badTitle: ReactNode;
  bad: ReactNode[];
  goodTitle: ReactNode;
  good: ReactNode[];
}) {
  return (
    <div className="grid md:grid-cols-2 gap-5">
      <div className="rounded-2xl border border-danger/25 bg-white overflow-hidden">
        <p className="bg-danger/10 text-danger font-bold text-[15px] px-5 py-3.5 flex items-center gap-2">
          <X className="w-4 h-4" strokeWidth={3} aria-hidden /> {badTitle}
        </p>
        <ul className="divide-y divide-paper-border">
          {bad.map((b, i) => (
            <li key={i} className="flex gap-3 px-5 py-3.5 font-landing text-[15px] leading-[1.6] text-ink">
              <span aria-hidden className="mt-1 grid place-items-center w-5 h-5 rounded-full bg-danger/10 text-danger shrink-0">
                <X className="w-3 h-3" strokeWidth={3} />
              </span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-2xl border border-good/25 bg-white overflow-hidden">
        <p className="bg-good/10 text-good font-bold text-[15px] px-5 py-3.5 flex items-center gap-2">
          <Check className="w-4 h-4" strokeWidth={3} aria-hidden /> {goodTitle}
        </p>
        <ul className="divide-y divide-paper-border">
          {good.map((g, i) => (
            <li key={i} className="flex gap-3 px-5 py-3.5 font-landing text-[15px] leading-[1.6] text-ink">
              <span aria-hidden className="mt-1 grid place-items-center w-5 h-5 rounded-full bg-good/10 text-good shrink-0">
                <Check className="w-3 h-3" strokeWidth={3} />
              </span>
              <span>{g}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function FaqList({ items }: { items: Faq[] }) {
  return (
    <div className="divide-y divide-paper-border border-y border-paper-border">
      {items.map((f) => (
        <details key={f.q} className="group py-5">
          <summary className="cursor-pointer list-none flex justify-between gap-4 font-bold text-[17px] text-ink">
            {f.q}
            <span aria-hidden className="text-moss-dark text-xl leading-none transition-transform group-open:rotate-45">+</span>
          </summary>
          <p className="font-landing text-[15.5px] leading-[1.75] text-ink-muted mt-3">{f.a}</p>
        </details>
      ))}
    </div>
  );
}

/** Ordinateur portable moderne : barre de navigateur, écran, socle. */
export function LaptopFrame({ children, url = "boosteats.be/admin", className = "" }: { children: ReactNode; url?: string; className?: string }) {
  return (
    <div className={`mx-auto w-full max-w-[760px] ${className}`}>
      <div className="rounded-t-[18px] bg-[#1b1b1d] p-[10px] pb-0 shadow-[0_40px_90px_rgba(10,10,10,0.28)] ring-1 ring-black/40">
        <div className="rounded-t-[10px] overflow-hidden bg-white">
          <div className="flex items-center gap-2 bg-[#f2f2ef] border-b border-paper-border px-3 py-2">
            <span className="flex gap-1.5" aria-hidden>
              <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
            </span>
            <span className="flex-1 mx-6 rounded-md bg-white border border-paper-border text-[11px] text-ink-faint text-center py-1 truncate">{url}</span>
          </div>
          <div className="font-landing">{children}</div>
        </div>
      </div>
      <div className="relative h-[14px] bg-gradient-to-b from-[#d9d9d6] to-[#a9a9a4] rounded-b-[14px] mx-[-3%] shadow-[0_12px_24px_rgba(10,10,10,0.18)]">
        <span className="absolute left-1/2 -translate-x-1/2 top-0 w-[16%] h-[6px] rounded-b-[8px] bg-[#8d8d88]" aria-hidden />
      </div>
    </div>
  );
}

export function RelatedPages({ slugs, title = "À voir aussi" }: { slugs: string[]; title?: string }) {
  const pages = slugs.map(getMarketingPage).filter((p): p is NonNullable<typeof p> => !!p);
  if (pages.length === 0) return null;
  return (
    <nav aria-label={title} className="max-w-[1100px] mx-auto px-5 sm:px-8 py-12">
      <p className="text-[12.5px] font-bold uppercase tracking-[0.1em] text-ink-faint">{title}</p>
      <ul className="mt-3 flex flex-wrap gap-3">
        {pages.map((p) => (
          <li key={p.slug}>
            <Link href={`/${p.slug}`} className="inline-block rounded-full border border-paper-border bg-white px-4 py-2 text-[14px] font-semibold text-ink hover:border-moss">
              {p.navLabel}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
