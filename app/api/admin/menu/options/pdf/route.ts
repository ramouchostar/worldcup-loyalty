import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase";
import { buildReviews, matchLines } from "@/lib/menu-options/pdf";
import { PdfReadError, readMenuPdf } from "@/lib/menu-options/pdf-read";
import { saveReviews, supabasePdfDb } from "@/lib/menu-options/pdf-save";

// ADR 0100 §8 — importer le PDF du menu : reprendre les descriptions que le restaurateur a écrites et lui proposer les
// allergènes IMPRIMÉS dans son PDF, à relire et confirmer plat par plat (console seulement).
//
// POST /api/admin/menu/options/pdf  (multipart : restaurantId, file)
//   → { linesRead, reviews, unmatchedLines: [{ name }], articlesWithout: [articleId], counts }
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
  if (!restaurantId || !(file instanceof File)) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  const admin = createAdminClient();
  const { data, error } = await admin.from("menu_items").select("id, name").eq("restaurant_id", restaurantId).eq("is_active", true);
  if (error) return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  const items = (data ?? []) as { id: string; name: string }[];
  if (items.length === 0) return NextResponse.json({ error: "Ton menu est vide : ajoute d'abord tes plats dans « Menu et coûts »." }, { status: 409 });

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { lines, tokens } = await readMenuPdf(bytes);
    const result = matchLines(lines, items);
    const reviews = buildReviews(result.matches);
    console.info(`[menu-pdf-read] restaurant=${restaurantId} user=${guard.userId} octets=${bytes.length} lignes=${lines.length} rapprochees=${result.matches.length} a_part=${result.unmatchedLines.length} jetons=${tokens.input}/${tokens.output}`);
    return NextResponse.json({
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
    });
  } catch (e) {
    if (e instanceof PdfReadError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[menu-pdf-read]", e);
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
