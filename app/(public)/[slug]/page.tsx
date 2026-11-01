import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/restaurateurs/Header";
import { Footer } from "@/components/restaurateurs/Footer";
import { RestaurantSearchBar } from "@/components/audit-gratuit/RestaurantSearchBar";
import { TrackedLink } from "@/components/analytics/TrackedLink";
import { MARKETING_PAGES, PILLAR_LABEL, getMarketingPage } from "@/lib/marketing-pages";
import { absoluteUrl } from "@/lib/seo-pages";

// Pages publiques de la stratégie SEO (docs/strategie/seo-et-pages.md) : une
// page par fonction et une page par angle de l'analyse gratuite. Un seul
// gabarit, le texte vit dans lib/marketing-pages.ts. Toute page répond à UNE
// recherche et finit sur l'analyse gratuite (l'aimant à contacts, ADR 0071).
// Les clics sont tracés par page (`cta_location = page_<slug>`).

export const dynamicParams = false;

export function generateStaticParams() {
  return MARKETING_PAGES.map((p) => ({ slug: p.slug }));
}

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const page = getMarketingPage((await params).slug);
  if (!page) return {};
  return {
    title: page.metaTitle,
    description: page.metaDescription,
    alternates: { canonical: `/${page.slug}` },
    openGraph: {
      title: `${page.metaTitle} — Boosteats`,
      description: page.metaDescription,
      url: absoluteUrl(`/${page.slug}`),
      siteName: "Boosteats",
      locale: "fr_BE",
      type: "website",
      images: ["/opengraph-image"],
    },
  };
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display text-[26px] sm:text-[32px] leading-[1.2] tracking-[-0.02em] font-bold text-ink text-pretty">
      {children}
    </h2>
  );
}

function SearchCard({ location }: { location: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-[0_16px_40px_rgba(10,10,10,0.1)] border border-paper-border p-2 text-left">
      <RestaurantSearchBar location={location} />
    </div>
  );
}

export default async function MarketingPage({ params }: Params) {
  const page = getMarketingPage((await params).slug);
  if (!page) notFound();

  const where = `page_${page.slug}`;
  const isAnalysis = page.kind === "analyse";
  const faqData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: page.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };

  return (
    <div className="bg-paper min-h-screen flex flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqData) }} />
      <Header />
      <main className="flex-1">
        {/* En-tête : la question du restaurateur, puis l'analyse gratuite tout de suite. */}
        <section className="max-w-[880px] mx-auto px-5 sm:px-8 pt-14 sm:pt-20 pb-12 text-center">
          <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-moss-dark">
            {page.pillar ? PILLAR_LABEL[page.pillar] : page.eyebrow}
          </p>
          <h1 className="font-display text-[34px] sm:text-[46px] lg:text-[54px] leading-[1.08] tracking-[-0.03em] font-bold text-ink text-pretty mt-3">
            {page.h1}
          </h1>
          <p className="font-landing text-[17px] leading-[1.7] text-ink-muted mt-5 max-w-[640px] mx-auto">{page.lead}</p>
          {isAnalysis ? (
            <div className="mt-8 max-w-[640px] mx-auto">
              <SearchCard location={where} />
              <p className="text-[13px] text-ink-faint mt-3">Note sur 100 en moins d&apos;une minute · gratuit, sans engagement</p>
            </div>
          ) : (
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <TrackedLink
                ctaId="audit_gratuit"
                ctaLocation={where}
                audience="restaurateur"
                href="/audit-gratuit"
                className="bg-moss text-white text-[15px] font-bold rounded-lg px-6 py-3.5 hover:bg-moss-dark transition-colors"
              >
                Analyser mon restaurant gratuitement
              </TrackedLink>
              <TrackedLink
                ctaId="devenir_partenaire"
                ctaLocation={where}
                audience="restaurateur"
                href="/become-a-partner"
                className="border-[1.5px] border-moss text-moss-dark text-[15px] font-bold rounded-lg px-6 py-3.5 hover:bg-moss-tint transition-colors"
              >
                Commencer gratuitement
              </TrackedLink>
            </div>
          )}
        </section>

        <section className="bg-white border-y border-paper-border">
          <div className="max-w-[1000px] mx-auto px-5 sm:px-8 py-14">
            <SectionTitle>{page.problem.title}</SectionTitle>
            <ul className="grid sm:grid-cols-2 gap-4 mt-7">
              {page.problem.points.map((pt) => (
                <li key={pt} className="rounded-xl bg-paper border border-paper-border p-5 font-landing text-[15.5px] leading-[1.65] text-ink">
                  {pt}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="max-w-[1000px] mx-auto px-5 sm:px-8 py-14">
          <SectionTitle>{page.how.title}</SectionTitle>
          <ol className="mt-7 space-y-4">
            {page.how.steps.map((s, i) => (
              <li key={s.title} className="flex gap-4 rounded-xl bg-white border border-paper-border p-5">
                <span className="shrink-0 grid place-items-center w-9 h-9 rounded-full bg-moss text-white font-bold">{i + 1}</span>
                <div>
                  <h3 className="font-bold text-[17px] text-ink">{s.title}</h3>
                  <p className="font-landing text-[15.5px] leading-[1.65] text-ink-muted mt-1">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {page.checklist && (
          <section className="bg-moss-tint">
            <div className="max-w-[1000px] mx-auto px-5 sm:px-8 py-14">
              <SectionTitle>{page.checklist.title}</SectionTitle>
              <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-3 mt-7">
                {page.checklist.items.map((it) => (
                  <li key={it} className="flex gap-3 font-landing text-[15.5px] leading-[1.6] text-ink">
                    <span aria-hidden className="text-moss-dark font-bold">✓</span>
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        <section className="max-w-[1000px] mx-auto px-5 sm:px-8 py-14 grid lg:grid-cols-2 gap-10">
          <div>
            <SectionTitle>{page.youDo.title}</SectionTitle>
            <ul className="mt-6 space-y-3">
              {page.youDo.items.map((it) => (
                <li key={it} className="flex gap-3 font-landing text-[15.5px] leading-[1.65] text-ink">
                  <span aria-hidden className="mt-2 w-2 h-2 rounded-full bg-moss shrink-0" />
                  <span>{it}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <SectionTitle>{page.youSee.title}</SectionTitle>
            <div className="mt-6 space-y-3">
              {page.youSee.items.map((it) => (
                <div key={it.title} className="rounded-xl bg-white border border-paper-border p-4">
                  <h3 className="font-bold text-[16px] text-ink">{it.title}</h3>
                  <p className="font-landing text-[15px] leading-[1.6] text-ink-muted mt-1">{it.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white border-y border-paper-border">
          <div className="max-w-[880px] mx-auto px-5 sm:px-8 py-14">
            <SectionTitle>Vos questions</SectionTitle>
            <div className="mt-6 divide-y divide-paper-border">
              {page.faq.map((f) => (
                <details key={f.q} className="group py-4">
                  <summary className="cursor-pointer list-none flex justify-between gap-4 font-bold text-[16.5px] text-ink">
                    {f.q}
                    <span aria-hidden className="text-moss-dark transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="font-landing text-[15.5px] leading-[1.7] text-ink-muted mt-2">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="max-w-[880px] mx-auto px-5 sm:px-8 py-16 text-center">
          <SectionTitle>{page.ctaTitle}</SectionTitle>
          <p className="font-landing text-base leading-[1.7] text-ink-muted mt-4 max-w-[560px] mx-auto">{page.ctaBody}</p>
          <div className="mt-7 max-w-[640px] mx-auto">
            <SearchCard location={`${where}_bas`} />
          </div>
          <div className="mt-4">
            <TrackedLink
              ctaId="devenir_partenaire"
              ctaLocation={`${where}_bas`}
              audience="restaurateur"
              href="/become-a-partner"
              className="text-[15px] font-semibold text-moss-dark hover:underline"
            >
              Ou commencer gratuitement →
            </TrackedLink>
          </div>
        </section>

        {page.related.length > 0 && (
          <nav aria-label="À lire aussi" className="max-w-[1000px] mx-auto px-5 sm:px-8 pb-16">
            <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-ink-faint">À lire aussi</p>
            <ul className="mt-3 flex flex-wrap gap-3">
              {page.related.map((slug) => {
                const r = getMarketingPage(slug);
                return r ? (
                  <li key={slug}>
                    <Link href={`/${slug}`} className="inline-block rounded-full border border-paper-border bg-white px-4 py-2 text-[14px] font-semibold text-ink hover:border-moss">
                      {r.navLabel}
                    </Link>
                  </li>
                ) : null;
              })}
            </ul>
          </nav>
        )}
      </main>
      <Footer />
    </div>
  );
}
