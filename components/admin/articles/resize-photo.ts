// ADR 0111 §5 — réduire la photo SUR LE TÉLÉPHONE avant l'envoi (1 600 points au plus, JPEG, 2 Mo au plus). Le serveur
// la réenregistre de toute façon et efface la position GPS et les autres métadonnées. Navigateur uniquement.

import { PHOTO_MAX_BYTES, PHOTO_TYPES } from "@/lib/restaurant-posts/types";

const MAX_EDGE = 1600;

export type Resized = { ok: true; file: File } | { ok: false; error: string };

export async function resizePhoto(file: File): Promise<Resized> {
  try {
    // L'orientation notée par le téléphone est appliquée au décodage : la photo ne part pas couchée.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.fillStyle = "#ffffff"; // un fond transparent deviendrait noir en JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    for (const quality of [0.85, 0.7, 0.55]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= PHOTO_MAX_BYTES) return { ok: true, file: new File([blob], "photo.jpg", { type: "image/jpeg" }) };
    }
    return { ok: false, error: "Photo trop lourde, même réduite. Prends-en une autre." };
  } catch {
    // Navigateur qui ne sait pas décoder : l'original part seulement s'il est déjà acceptable.
    if ((PHOTO_TYPES as readonly string[]).includes(file.type) && file.size <= PHOTO_MAX_BYTES) return { ok: true, file };
    return { ok: false, error: "Cette photo n'a pas pu être préparée. Choisis une photo JPG, PNG ou WebP." };
  }
}
