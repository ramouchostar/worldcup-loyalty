import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AnalysisCta, Heading, MarketingShell } from "@/components/marketing/kit";
import { sortedArticles } from "@/lib/blog";

export const metadata = {
  title: "Le blog des restaurateurs : Google, pub, chiffre d'affaires",
  description:
    "Fiche Google, avis, pub Facebook, Instagram et TikTok, chiffre d'affaires, food cost : des guides concrets pour remplir votre restaurant, écrits pour les restaurateurs.",
  alternates: { canonical: "/blog" },
};

export default function BlogIndexPage() {
  const articles = sortedArticles();
  return (
    <MarketingShell>
      <section className="bg-white border-b border-paper-border">
        <div className="max-w-[1100px] mx-auto px-5 sm:px-8 pt-14 sm:pt-20 pb-12">
          <Heading
            as="h1"
            eyebrow="Le blog"
            title="Remplir sa salle, concrètement"
            intro="Des guides écrits pour les restaurateurs : votre fiche Google, vos avis, la pub sur Facebook, Instagram et TikTok, votre chiffre d'affaires et vos coûts. Ce qu'on voit marcher sur le terrain, à Bruxelles."
          />
        </div>
      </section>
      <section className="max-w-[1100px] mx-auto px-5 sm:px-8 py-14">
        {articles.length === 0 ? (
          <p className="font-landing text-ink-muted">Les premiers articles arrivent.</p>
        ) : (
          <ul className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {articles.map((a) => (
              <li key={a.slug}>
                <Link
                  href={`/blog/${a.slug}`}
                  className="group h-full flex flex-col rounded-2xl border border-paper-border bg-white p-6 hover:border-moss hover:shadow-[0_16px_40px_rgba(10,10,10,0.08)] transition-all"
                >
                  <span className="self-start rounded-full bg-moss-tint text-moss-dark text-[12px] font-bold px-3 py-1">{a.category}</span>
                  <h2 className="font-display text-[21px] leading-[1.25] font-bold text-ink mt-4 text-pretty">{a.title}</h2>
                  <p className="font-landing text-[15px] leading-[1.65] text-ink-muted mt-3 flex-1">{a.excerpt}</p>
                  <span className="mt-5 inline-flex items-center gap-1.5 text-[14px] font-bold text-moss-dark">
                    Lire · {a.readingMinutes} min <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <AnalysisCta location="blog_index" />
    </MarketingShell>
  );
}
