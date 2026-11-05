// Format d'un article du blog (app/(public)/blog). Le texte est structuré en
// blocs pour que le rendu reste cohérent et que les appels à l'action
// (analyse gratuite, WhatsApp) tombent au bon endroit dans la lecture.
// Mêmes règles de texte que les pages (lib/marketing-pages.ts).

export type BlogBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string; id: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "callout"; tone: "astuce" | "attention"; title: string; text: string }
  | { type: "compare"; badTitle: string; bad: string[]; goodTitle: string; good: string[] }
  | { type: "table"; head: string[]; rows: string[][] }
  | { type: "cta"; kind: "analyse" | "whatsapp"; title: string; text: string };

export type BlogCategory = "Google" | "Publicité" | "Chiffre d'affaires" | "Fidélité" | "Coûts" | "Comparatifs";

export type BlogArticle = {
  slug: string;
  category: BlogCategory;
  title: string;
  /** ≤ 58 caractères, sans « — Boosteats ». */
  metaTitle: string;
  /** 120 à 160 caractères. */
  metaDescription: string;
  excerpt: string;
  /** AAAA-MM-JJ */
  published: string;
  readingMinutes: number;
  keywords: string[];
  blocks: BlogBlock[];
  faq: { q: string; a: string }[];
  /** Pages (slugs de lib/marketing-pages.ts) ou articles (préfixe « blog/ ») liés. */
  related: string[];
};
