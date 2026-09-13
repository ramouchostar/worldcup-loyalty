import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase";
import { MENU_IMAGE_BUCKET } from "@/lib/menu-images";

// Photo d'un article du catalogue (migration 20260912-1120) — dépôt manuel par
// le restaurateur, en complément de l'import en masse
// (scripts/import-menu-images.mjs).
//
// Pas de SVG, contrairement au logo : une photo de plat n'a aucune raison
// d'être vectorielle, et le bucket est public — autant ne pas y servir de
// fichier exécutable par le navigateur.
const PHOTO_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
const MAX_BYTES = 2 * 1024 * 1024;

// Chemin horodaté : un remplacement ne doit pas être masqué par le cache du
// navigateur ou du CDN. L'ancien fichier est supprimé juste après.
const slug = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "article";

// Vérifie que l'article existe ET appartient bien à l'établissement : sans ce
// contrôle, un gérant pourrait écrire une photo sur l'article d'un autre
// établissement en forgeant menuItemId (ADR 0015 §7).
async function loadItem(restaurantId: string, menuItemId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("menu_items")
    .select("id, name, image_path")
    .eq("id", menuItemId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  return data as { id: string; name: string; image_path: string | null } | null;
}

// POST /api/admin/menu/image — FormData { restaurantId, menuItemId, file }.
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const restaurantId = String(form.get("restaurantId") ?? "");
  const menuItemId = String(form.get("menuItemId") ?? "");
  const file = form.get("file");
  if (!restaurantId || !menuItemId) {
    return NextResponse.json({ error: "restaurantId et menuItemId requis." }, { status: 400 });
  }

  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 });
  }
  const ext = PHOTO_TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Formats acceptés : JPG, PNG ou WebP." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Photo : 2 Mo maximum." }, { status: 400 });

  const item = await loadItem(restaurantId, menuItemId);
  if (!item) return NextResponse.json({ error: "Article introuvable." }, { status: 404 });

  const admin = createAdminClient();
  const path = `${restaurantId}/${slug(item.name)}-${Date.now()}.${ext}`;
  const { error: upErr } = await admin.storage
    .from(MENU_IMAGE_BUCKET)
    .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: true });
  if (upErr) return NextResponse.json({ error: "Erreur lors de l'envoi de la photo. Réessaie." }, { status: 500 });

  const { error: dbErr } = await admin
    .from("menu_items")
    .update({ image_path: path, image_source: "upload" })
    .eq("id", item.id);
  if (dbErr) {
    // La base n'a pas suivi : on ne laisse pas un fichier orphelin derrière.
    await admin.storage.from(MENU_IMAGE_BUCKET).remove([path]);
    return NextResponse.json({ error: "Photo envoyée mais non enregistrée. Réessaie." }, { status: 500 });
  }

  // Ménage de l'ancienne photo — après la mise à jour, jamais avant : si la
  // suppression échoue on garde un fichier inutile, ce qui est sans gravité,
  // alors que l'inverse casserait l'affichage.
  if (item.image_path && item.image_path !== path) {
    await admin.storage.from(MENU_IMAGE_BUCKET).remove([item.image_path]);
  }

  return NextResponse.json({ ok: true, image_path: path });
}

// DELETE /api/admin/menu/image?restaurantId=…&menuItemId=… — retire la photo.
export async function DELETE(req: NextRequest) {
  const restaurantId = req.nextUrl.searchParams.get("restaurantId");
  const menuItemId = req.nextUrl.searchParams.get("menuItemId");
  if (!restaurantId || !menuItemId) {
    return NextResponse.json({ error: "restaurantId et menuItemId requis." }, { status: 400 });
  }

  const guard = await requireAdmin(restaurantId);
  if (!guard.ok) return guard.response;

  const item = await loadItem(restaurantId, menuItemId);
  if (!item) return NextResponse.json({ error: "Article introuvable." }, { status: 404 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("menu_items")
    .update({ image_path: null, image_source: null })
    .eq("id", item.id);
  if (error) return NextResponse.json({ error: "Suppression impossible. Réessaie." }, { status: 500 });

  if (item.image_path) await admin.storage.from(MENU_IMAGE_BUCKET).remove([item.image_path]);
  return NextResponse.json({ ok: true });
}
