import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Lightbulb, TriangleAlert } from "lucide-react";
import { AnalysisCta, CompareColumns, FaqList, MarketingShell, SearchCard, WhatsAppLink } from "@/components/marketing/kit";
import { BLOG_ARTICLES, getArticle } from "@/lib/blog";
import type { BlogBlock } from "@/lib/blog/types";
import { getMarketingPage } from "@/lib/marketing-pages";
import { SITE_ORIGIN } from "@/lib/site";
import { absoluteUrl } from "@/lib/seo-pages";

// Article du blog : sommaire, blocs de texte, appels à l'action insérés dans la
// lecture (analyse gratuite, WhatsApp), FAQ et données structurées BlogPosting.
// Les clics sont tracés par article (`cta_location = blog_<slug>`).

export const dynamicParams = false;

export function generateStaticParams() {
  return BLOG_ARTICLES.map((a) => ({ slug: a.slug }));
}

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const a = getArticle((await params).slug);
  if (!a) return {};
  return {
    title: a.metaTitle,
    description: a.metaDescription,
    alternates: { canonical: `/blog/${a.slug}` },
    openGraph: {
      title: `${a.metaTitle} — Boosteats`,
      description: a.metaDescription,
      url: absoluteUrl(`/blog/${a.slug}`),
      siteName: "Boosteats",
      locale: "fr_BE",
      type: "article",
      publishedTime: a.published,
      images: ["/opengraph-image"],
    },
  };
}

const dateFr = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-BE", { day: "numeric", month: "long", year: "numeric" });

function Block({ b, where }: { b: BlogBlock; where: string }) {
  switch (b.type) {
    case "p":
      return <p className="font-landing text-[17px] leading-[1.8] text-ink/90">{b.text}</p>;
    case "h2":
      return (
        <h2 id={b.id} className="font-display text-[26px] sm:text-[30px] leading-[1.2] tracking-[-0.02em] font-bold text-ink pt-6 scroll-mt-24">
          {b.text}
        </h2>
      );
    case "h3":
      return <h3 className="font-bold text-[19px] text-ink pt-2">{b.text}</h3>;
    case "ul":
      return (
        <ul className="space-y-2.5 pl-1">
          {b.items.map((it) => (
            <li key={it} className="flex gap-3 font-landing text-[17px] leading-[1.7] text-ink/90">
              <span aria-hidden className="mt-[11px] w-1.5 h-1.5 rounded-full bg-moss-dark shrink-0" />
              <span>{it}</span>
            </li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol className="space-y-3">
          {b.items.map((it, i) => (
            <li key={it} className="flex gap-3 font-landing text-[17px] leading-[1.7] text-ink/90">
              <span className="grid place-items-center w-7 h-7 rounded-full bg-moss-tint text-moss-dark text-[14px] font-bold shrink-0">{i + 1}</span>
              <span className="pt-0.5">{it}</span>
            </li>
          ))}
        </ol>
      );
    case "callout": {
      const tip = b.tone === "astuce";
      const Icon = tip ? Lightbulb : TriangleAlert;
      return (
        <aside className={`rounded-2xl border p-5 ${tip ? "bg-moss-tint border-moss/30" : "bg-[#FBF3E6] border-warn/25"}`}>
          <p className={`flex items-center gap-2 font-bold text-[16px] ${tip ? "text-moss-dark" : "text-warn"}`}>
            <Icon className="w-4 h-4" aria-hidden /> {b.title}
          </p>
          <p className="font-landing text-[16px] leading-[1.7] text-ink mt-2">{b.text}</p>
        </aside>
      );
    }
    case "compare":
      return <CompareColumns badTitle={b.badTitle} bad={b.bad} goodTitle={b.goodTitle} good={b.good} />;
    case "table":
      return (
        <div className="overflow-x-auto rounded-xl border border-paper-border bg-white">
          <table className="w-full text-left text-[15px]">
            <thead className="bg-paper-subtle">
              <tr>{b.head.map((h) => <th key={h} className="px-4 py-3 font-bold text-ink">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-paper-border">
              {b.rows.map((r, i) => (
                <tr key={i}>{r.map((c, j) => <td key={j} className="px-4 py-3 font-landing text-ink/90 align-top">{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "cta":
      return (
        <aside className="rounded-2xl bg-ink p-6 sm:p-7 my-4">
          <p className="font-display text-[22px] font-bold text-white leading-tight">{b.title}</p>
          <p className="font-landing text-[15.5px] leading-[1.7] text-night-text mt-2">{b.text}</p>
          <div className="mt-5">
            {b.kind === "analyse" ? <SearchCard location={`${where}_milieu`} /> : <WhatsAppLink location={`${where}_milieu`} variant="solid" />}
          </div>
        </aside>
      );
  }
}

export default async function BlogArticlePage({ params }: Params) {
  const a = getArticle((await params).slug);
  if (!a) notFound();
  const where = `blog_${a.slug}`;
  const toc = a.blocks.filter((b): b is Extract<BlogBlock, { type: "h2" }> => b.type === "h2");
  const structured = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: a.title,
    description: a.metaDescription,
    datePublished: a.published,
    inLanguage: "fr-BE",
    mainEntityOfPage: absoluteUrl(`/blog/${a.slug}`),
    author: { "@type": "Organization", name: "Boosteats", url: SITE_ORIGIN },
    publisher: { "@id": `${SITE_ORIGIN}/#organisation` },
  };

  return (
    <MarketingShell faq={a.faq}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structured) }} />
      <article>
        <header className="bg-white border-b border-paper-border">
          <div className="max-w-[780px] mx-auto px-5 sm:px-8 pt-12 sm:pt-16 pb-10">
            <nav aria-label="Fil d'Ariane" className="text-[13px] text-ink-faint">
              <Link href="/blog" className="hover:text-ink">Blog</Link> <span aria-hidden>/</span> {a.category}
            </nav>
            <h1 className="font-display text-[34px] sm:text-[46px] leading-[1.08] tracking-[-0.03em] font-bold text-ink text-pretty mt-4">{a.title}</h1>
            <p className="font-landing text-[18px] leading-[1.7] text-ink-muted mt-5">{a.excerpt}</p>
            <p className="text-[13.5px] text-ink-faint mt-5">
              Publié le {dateFr(a.published)} · {a.readingMinutes} min de lecture
            </p>
          </div>
        </header>

        <div className="max-w-[780px] mx-auto px-5 sm:px-8 py-12">
          {toc.length > 2 && (
            <nav aria-label="Sommaire" className="rounded-2xl border border-paper-border bg-white p-5 mb-10">
              <p className="text-[12.5px] font-bold uppercase tracking-[0.1em] text-ink-faint">Au sommaire</p>
              <ol className="mt-3 space-y-1.5">
                {toc.map((h) => (
                  <li key={h.id}>
                    <a href={`#${h.id}`} className="font-landing text-[15.5px] text-ink hover:text-moss-dark">{h.text}</a>
                  </li>
                ))}
              </ol>
            </nav>
          )}
          <div className="space-y-6">
            {a.blocks.map((b, i) => <Block key={i} b={b} where={where} />)}
          </div>

          {a.faq.length > 0 && (
            <section className="mt-14">
              <h2 className="font-display text-[26px] sm:text-[30px] font-bold text-ink mb-4">Vos questions</h2>
              <FaqList items={a.faq} />
            </section>
          )}

          {a.related.length > 0 && (
            <nav aria-label="À lire aussi" className="mt-12">
              <p className="text-[12.5px] font-bold uppercase tracking-[0.1em] text-ink-faint">À lire aussi</p>
              <ul className="mt-3 flex flex-wrap gap-3">
                {a.related.map((r) => {
                  const isBlog = r.startsWith("blog/");
                  const label = isBlog ? getArticle(r.slice(5))?.title : getMarketingPage(r)?.navLabel;
                  return label ? (
                    <li key={r}>
                      <Link href={`/${r}`} className="inline-block rounded-full border border-paper-border bg-white px-4 py-2 text-[14px] font-semibold text-ink hover:border-moss">
                        {label}
                      </Link>
                    </li>
                  ) : null;
                })}
              </ul>
            </nav>
          )}
        </div>
      </article>
      <AnalysisCta location={where} />
    </MarketingShell>
  );
}
