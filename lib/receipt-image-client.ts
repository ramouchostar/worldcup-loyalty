// Préparation côté NAVIGATEUR de la photo de ticket avant envoi.
//
// Pourquoi : une photo de smartphone récent pèse 3 à 12 Mo (et HEIC sur
// iPhone). Vercel refuse tout corps > 4,5 Mo avant notre code (413), l'OCR
// est plus lent et plus cher sur une image énorme, et le réseau mobile est
// lent. Un ticket de caisse n'a besoin que de ~1 600 px de côté en JPEG pour
// être lu parfaitement → on redimensionne/ré-encode ici, avant l'upload.
//
// - Décodage via createImageBitmap (gère l'orientation EXIF) — Safari iOS
//   décode aussi le HEIC → on obtient un JPEG universel.
// - Si le navigateur ne sait pas décoder (vieux Android + HEIC…), on renvoie
//   le fichier d'origine s'il est sous le plafond, sinon une erreur CLAIRE.
// Pas de dépendance, pas d'import serveur : client only.
import { MAX_UPLOAD_BYTES, formatMb } from "./receipt-upload-errors";

export const RECEIPT_MAX_EDGE = 1600;
export const RECEIPT_JPEG_QUALITY = 0.85;
// En dessous, une image JPEG/PNG/WebP « normale » part telle quelle.
const PASSTHROUGH_BYTES = 1.2 * 1024 * 1024;
const NATIVE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type PreparedReceipt =
  | { ok: true; file: File; resized: boolean }
  | { ok: false; error: string };

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    } catch {
      /* on tente <img> ci-dessous */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("decode"));
      img.src = url;
    });
  } finally {
    // l'URL reste valide le temps du dessin : révoquée par l'appelant via GC
  }
}

export async function prepareReceiptImage(file: File): Promise<PreparedReceipt> {
  // Déjà léger et dans un format universel : rien à faire.
  if (NATIVE_TYPES.has(file.type) && file.size <= PASSTHROUGH_BYTES) {
    return { ok: true, file, resized: false };
  }

  try {
    const src = await decode(file);
    const w = "width" in src ? src.width : (src as HTMLImageElement).naturalWidth;
    const h = "height" in src ? src.height : (src as HTMLImageElement).naturalHeight;
    if (!w || !h) throw new Error("dimensions");
    const scale = Math.min(1, RECEIPT_MAX_EDGE / Math.max(w, h));
    const cw = Math.round(w * scale), ch = Math.round(h * scale);

    const canvas = document.createElement("canvas");
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.drawImage(src as CanvasImageSource, 0, 0, cw, ch);
    if ("close" in src) (src as ImageBitmap).close();

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", RECEIPT_JPEG_QUALITY)
    );
    if (!blob) throw new Error("encode");
    const name = (file.name || "ticket").replace(/\.[a-z0-9]+$/i, "") + ".jpg";
    return { ok: true, file: new File([blob], name, { type: "image/jpeg" }), resized: true };
  } catch {
    // Décodage impossible (format exotique) : on laisse passer l'original
    // seulement s'il est envoyable tel quel, sinon message clair.
    if (NATIVE_TYPES.has(file.type) && file.size <= MAX_UPLOAD_BYTES) {
      return { ok: true, file, resized: false };
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return {
        ok: false,
        error: `Cette photo pèse ${formatMb(file.size)} et ton navigateur n'a pas pu l'alléger. Reprends le ticket en photo directement depuis l'app, ou choisis une photo plus légère.`,
      };
    }
    return {
      ok: false,
      error: "Ce format d'image n'est pas lisible ici. Reprends le ticket en photo directement depuis l'app (JPG).",
    };
  }
}
