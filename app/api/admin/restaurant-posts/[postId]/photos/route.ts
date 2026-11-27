import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { signPhotoUrls, supabasePostsDb } from "@/lib/restaurant-posts/db";
import { postsCatch, postsError, postsFailure, requirePostWriter } from "@/lib/restaurant-posts/guard";
import { preparePhoto } from "@/lib/restaurant-posts/photo";
import { addPhoto } from "@/lib/restaurant-posts/service";
import { PHOTO_MAX_BYTES } from "@/lib/restaurant-posts/types";

// ADR 0111 §5 — une photo d'article : réduite sur le téléphone, puis RÉENREGISTRÉE ici (sharp) sans position GPS ni
// autre métadonnée, et rangée dans l'espace PRIVÉ du restaurant. Le brouillon ne change pas tant qu'il n'est pas gardé.
// POST /api/admin/restaurant-posts/<id>/photos  FormData { restaurantId, file }  →  { path, url }

export async function POST(req: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  // Refusé avant lecture quand la taille annoncée dépasse déjà (2 Mo, plus l'enveloppe du formulaire).
  if (Number(req.headers.get("content-length") ?? 0) > PHOTO_MAX_BYTES + 64 * 1024) return postsError("Photo : 2 Mo au plus.", 413);
  const form = await req.formData().catch(() => null);
  if (!form) return postsError("Requête invalide.", 400);
  const restaurantId = String(form.get("restaurantId") ?? "");
  const guard = await requirePostWriter(restaurantId);
  if (!guard.ok) return guard.response;
  if (!(await checkRateLimit(guard.userId, "post_photo", 40, 3600))) return postsError("Beaucoup de photos d'un coup. Réessaie dans une heure.", 429);
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return postsError("Aucune photo reçue.", 400);
  if (file.size > PHOTO_MAX_BYTES) return postsError("Photo : 2 Mo au plus.", 413);
  const photo = await preparePhoto(Buffer.from(await file.arrayBuffer()));
  if (!photo.ok) return postsError(photo.error, 400);
  try {
    const res = await addPhoto(supabasePostsDb(), { restaurantId, postId, data: photo.data });
    if (!res.ok) return postsFailure(res);
    const url = (await signPhotoUrls([res.path])).get(res.path) ?? null;
    return NextResponse.json({ path: res.path, url });
  } catch (e) {
    return postsCatch(e, "photo");
  }
}
