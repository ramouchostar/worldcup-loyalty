// ADR 0111 §5 — le serveur RÉENREGISTRE chaque photo : JPG, PNG ou WebP en entrée (jugés sur leur contenu, pas sur
// leur nom), une image JPEG neuve en sortie, redressée, réduite, SANS position GPS ni aucune autre métadonnée
// (sharp n'en recopie aucune tant qu'on ne le lui demande pas). Serveur uniquement.

import sharp from "sharp";
import { PHOTO_MAX_BYTES } from "./types";

const ACCEPTED = new Set(["jpeg", "png", "webp"]);
const MAX_EDGE = 1600;
/** Une image de plus de 40 millions de points ne vient pas d'un téléphone réduit : refusée avant d'être décodée. */
const MAX_PIXELS = 40_000_000;

export type PhotoResult = { ok: true; data: Buffer; width: number; height: number } | { ok: false; error: string };

const BAD_FORMAT = "Formats acceptés : JPG, PNG ou WebP.";

export async function preparePhoto(input: Buffer): Promise<PhotoResult> {
  if (input.length === 0) return { ok: false, error: "Aucune photo reçue." };
  if (input.length > PHOTO_MAX_BYTES) return { ok: false, error: "Photo : 2 Mo au plus." };
  try {
    const options = { limitInputPixels: MAX_PIXELS, failOn: "error" as const };
    const meta = await sharp(input, options).metadata();
    if (!meta.format || !ACCEPTED.has(meta.format)) return { ok: false, error: BAD_FORMAT };
    for (const quality of [82, 70, 55]) {
      const { data, info } = await sharp(input, options)
        .rotate() // applique l'orientation notée par le téléphone AVANT qu'elle disparaisse avec le reste
        .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality })
        .toBuffer({ resolveWithObject: true });
      if (data.length <= PHOTO_MAX_BYTES) return { ok: true, data, width: info.width, height: info.height };
    }
    return { ok: false, error: "Photo trop lourde, même réduite. Prends-en une autre." };
  } catch (e) {
    console.warn("[blog] photo refusée :", (e as Error).message);
    return { ok: false, error: "Cette photo n'a pas pu être lue. Prends-en une autre (JPG, PNG ou WebP)." };
  }
}
