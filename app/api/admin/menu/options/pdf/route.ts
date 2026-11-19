import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase";
import { buildReviews, matchLines } from "@/lib/menu-options/pdf";
import { PdfReadError, readMenu, type MenuSource } from "@/lib/menu-options/pdf-read";
import { fetchMenuPage } from "@/lib/menu-options/link-read";
import { buildHints, countHints } from "@/lib/menu-options/menu-structure";
import { chooseFamily, classifyArticle } from "@/lib/menu-options/families";
import { saveReviews, supabasePdfDb } from "@/lib/menu-options/pdf-save";

// ADR 0100 §8 — importer le PDF du menu : reprendre les descriptions que le restaurateur a écrites et lui proposer les
// allergènes IMPRIMÉS dans son PDF, à relire et confirmer plat par plat (console seulement).
//
// POST /api/admin/menu/options/pdf  (multipart : restaurantId, et SOIT file (un PDF) SOIT link (l'adresse du menu en ligne, ADR 0100 §11))
//   → { source, linesRead, reviews, unmatchedLines: [{ name }], articlesWithout: [articleId], counts, hints, menuCounts }
//   `hints` = la catégorie, les sauces et les accompagnements que le menu dit pour chaque plat rapproché (lots.ts s'en sert).
//   Rien n'est écrit : c'est une lecture. Les rapprochements incertains ne sont jamais devinés (lib/menu-options/pdf.ts).
// PUT  /api/admin/menu/options/pdf  { restaurantId, rows, trace }
//   Écrit ce que le restaurateur a relu ; le serveur revérifie tout.

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Envoi illisible. Réessaie avec un PDF de 4 Mo au plus." }, { status: 400 });
  }
  const restaurantId = typeof form.get("restaurantId") === "string" ? (form.get("restaurantId") as string) : "";
  const file = form.get("file");
  const link = typeof form.get("link") === "string" ? (form.get("link") as string).trim() : "";
  if (!restaurantId || (!(file instanceof File) && link === "")) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();
  const { data, error } = await admin.from("menu_items").select("id, name").eq("restaurant_id", restaurantId).eq("is_active", true);
  if (error) return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  const items = (data ?? []) as { id: string; name: string }[];
  if (items.length === 0) return NextResponse.json({ error: "Ton menu est vide : ajoute d'abord tes plats dans « Menu et coûts »." }, { status: 409 });

  try {
    let source: MenuSource;
    let origin: "pdf" | "lien";
    if (file instanceof File) {
      source = { kind: "pdf", bytes: new Uint8Array(await file.arrayBuffer()) };
      origin = "pdf";
    } else {
      source = await fetchMenuPage(link);
      origin = "lien";
    }
    const { lines, sections, tokens } = await readMenu(source);
    if (lines.length === 0) {
      // Rien de lu : on ne laisse pas croire que « tout va bien » (ADR 0065 : aucun échec silencieux).
      console.info(`[menu-read] source=${origin} restaurant=${restaurantId} user=${guard.userId} lignes=0 jetons=${tokens.input}/${tokens.output}`);
      throw new PdfReadError(
        origin === "lien"
          ? "Nous n'avons trouvé aucun plat à cette adresse. Colle le lien de la page qui montre ton menu, ou envoie ton PDF."
          : "Nous n'avons trouvé aucun plat dans ce PDF. Vérifie que c'est bien ton menu, ou essaie avec un PDF où l'on peut sélectionner le texte.",
        422,
      );
    }
    const result = matchLines(lines, items);
    const reviews = buildReviews(result.matches);
    const hints = buildHints(result.matches.map((m) => ({ articleId: m.articleId, category: m.line.category ?? null, kind: m.line.kind ?? null })), sections);
    const menuCounts = countHints(hints);
    // Trace (ADR 0065) : combien de plats Claude a su ranger, et combien notre dictionnaire ne savait pas (ceux que la lecture rattrape).
    const kindsRead = Object.keys(hints.kindOf ?? {}).length;
    const byDict = result.matches.map((m) => {
      const name = items.find((i) => i.id === m.articleId)?.name ?? m.line.name;
      return { kind: m.line.kind ?? null, name, dict: classifyArticle({ name, category: m.line.category }) };
    });
    const kindsRescued = byDict.filter((x) => x.kind && x.dict === "autre").length;
    const kindsChanged = byDict.filter((x) => x.kind && x.dict !== "autre" && chooseFamily(x.dict, x.kind, x.name) !== x.dict).length;
    // La trace (ADR 0065) : ce que la lecture a rendu, sans aucun nom de plat ni texte du menu.
    console.info(`[menu-read] source=${origin} restaurant=${restaurantId} user=${guard.userId} lignes=${lines.length} rapprochees=${result.matches.length} a_part=${result.unmatchedLines.length} rubriques=${menuCounts.categories} listes_sauces=${menuCounts.sauceLists} listes_accompagnements=${menuCounts.sideLists} sortes_lues=${kindsRead} sortes_rattrapees=${kindsRescued} sortes_changees=${kindsChanged} jetons=${tokens.input}/${tokens.output}`);
    return NextResponse.json({
      source: origin,
      linesRead: lines.length,
      reviews,
      unmatchedLines: result.unmatchedLines.map((l) => ({ name: l.name })),
      articlesWithout: result.articlesWithout,
      counts: {
        matched: result.matches.length,
        matchedNear: result.matches.filter((m) => m.how === "proche").length,
        unmatched: result.unmatchedLines.length,
        articlesWithout: result.articlesWithout.length,
      },
      hints,
      menuCounts,
    });
  } catch (e) {
    if (e instanceof PdfReadError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[menu-read]", e);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const restaurantId = typeof body?.restaurantId === "string" ? body.restaurantId : "";
  if (!restaurantId) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  const result = await saveReviews(supabasePdfDb(), restaurantId, body.rows, body.trace, guard.userId);
  if (!result.ok) {
    const { status, ...rest } = result;
    return NextResponse.json(rest, { status });
  }
  console.info(`[menu-pdf-save] restaurant=${restaurantId} user=${guard.userId} plats=${result.rows} trace=${result.traceSaved}`);
  return NextResponse.json(result);
}
