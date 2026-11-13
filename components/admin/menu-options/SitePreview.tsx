"use client";

import { useMemo, useState } from "react";
import { Card, StatusBadge } from "@/components/admin/ui";
import { plural } from "@/lib/menu-options/copy";
import { descriptionOf, type EditorState } from "@/lib/menu-options/lots";
import { buildPreview, checklist, type FactsById, type PreviewItem } from "@/lib/menu-options/site-preview";
import type { ArticleMeta } from "./LotCard";

// ADR 0100 §10 — « Ton site, tel que tes clients le verraient » : une liste de ce qui est prêt et un aperçu bâti sur les
// vrais plats, vrais choix, vraies descriptions et allergènes CONFIRMÉS. Il ne publie rien : le site public (ADR 0088)
// n'existe pas encore.

const euro = (n: number) => Number(n).toLocaleString("fr-BE", { style: "currency", currency: "EUR" });
const SHOWN = 3;

function Dish({ it }: { it: PreviewItem }) {
  return (
    <div className="flex min-w-0 gap-3 border-t border-paper-border pt-3">
      <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-lg text-center text-[11px] text-ink-muted ${it.hasPhoto ? "bg-paper" : "border border-dashed border-paper-border"}`}>
        {it.hasPhoto ? "photo" : "sans photo"}
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <b className="block break-words text-[15px] text-ink">{it.name}</b>
        {it.description && <p className="break-words text-[13px] text-ink-muted">{it.description}</p>}
        <p className={`text-[13px] ${it.allergens.confirmed ? "text-good" : "text-ink-muted"}`}>{it.allergens.text}</p>
        <p className="flex flex-wrap gap-x-3 text-[13px] text-ink">
          <span className="tabular-nums">{euro(it.price)}</span>
          {it.optionGroups > 0 && <span>{plural(it.optionGroups, "liste de choix", "listes de choix")}</span>}
          {it.pending && <StatusBadge tone="warn">Choix à valider</StatusBadge>}
        </p>
      </div>
    </div>
  );
}

export function SitePreview({ st, meta, configured, facts }: { st: EditorState; meta: ArticleMeta; configured: Record<string, number>; facts: FactsById }) {
  const [all, setAll] = useState(false);

  const articles = useMemo(
    () => Object.values(st.articles).map((a) => ({ id: a.id, name: a.name, category: a.category ?? "", family: st.families[a.id] })),
    [st.articles, st.families],
  );
  const lotByArticle = useMemo(() => {
    const m = new Map<string, (typeof st.lots)[number]>();
    for (const l of st.lots) for (const id of l.articleIds) m.set(id, l);
    return m;
  }, [st.lots]);

  const categories = useMemo(() => buildPreview({
    articles,
    price: (id) => meta[id]?.price ?? 0,
    hasPhoto: (id) => !!meta[id]?.hasPhoto,
    lotOf: (id) => { const l = lotByArticle.get(id); return l ? { validated: l.validated, groups: l.groups.length } : null; },
    editorDescription: (id) => { const l = lotByArticle.get(id); const d = l ? descriptionOf(st, l, id) : null; return d && d.text ? { text: d.text } : null; },
    configured,
    facts,
  }), [articles, meta, lotByArticle, st, configured, facts]);

  const items = categories.flatMap((c) => c.items);
  const checks = checklist({
    articles, items,
    lotsValidated: st.lots.filter((l) => l.validated).length,
    lotsTotal: st.lots.length,
  });

  return (
    <Card>
      <h2 className="text-[17px] font-semibold text-ink">Ton site, tel que tes clients le verraient</h2>
      <p className="mt-1 text-[15px] text-ink-muted">
        Un aperçu. Tout vient de ton menu Boosteats : les plats, les prix, les photos, tes choix, tes descriptions et les allergènes que tu as confirmés. Rien n&apos;est publié : ton site en ligne vient ensuite.
      </p>

      <ul className="mt-3 divide-y divide-paper-border">
        {checks.map((c) => (
          <li key={c.key} className="flex flex-wrap items-center gap-2 py-2 text-[15px] text-ink">
            <StatusBadge tone={c.ok ? "good" : "warn"}>{c.ok ? "Prêt" : "À finir"}</StatusBadge>
            <b>{c.title}</b>
            <span className="text-ink-muted">{c.text}</span>
          </li>
        ))}
      </ul>

      <div className="mx-auto mt-4 max-w-[440px] space-y-3 rounded-xl border border-paper-border bg-white p-4" aria-label="Aperçu du site">
        <div className="text-[17px] font-semibold text-ink">Ton restaurant · Commander</div>
        {categories.length === 0 ? (
          <p className="text-[15px] text-ink-muted">Ton menu est vide : il n&apos;y a rien à montrer.</p>
        ) : categories.map((cat) => (
          <section key={cat.name} className="space-y-3">
            <h3 className="pt-1 text-[13px] font-semibold uppercase tracking-wide text-ink-muted">{cat.name}</h3>
            {(all ? cat.items : cat.items.slice(0, SHOWN)).map((it) => <Dish key={it.id} it={it} />)}
            {!all && cat.items.length > SHOWN && <p className="text-[13px] text-ink-muted">+ {plural(cat.items.length - SHOWN, "autre plat", "autres plats")}</p>}
          </section>
        ))}
        {categories.some((c) => c.items.length > SHOWN) && (
          <button
            type="button" aria-expanded={all} onClick={() => setAll((a) => !a)}
            className="min-h-[44px] rounded-lg border border-paper-border bg-white px-4 py-2 text-[15px] font-semibold text-ink hover:border-ink-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
          >
            {all ? "Voir moins" : "Voir tous les plats"}
          </button>
        )}
      </div>
    </Card>
  );
}
