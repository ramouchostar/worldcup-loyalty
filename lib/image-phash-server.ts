import sharp from "sharp";
import { PHASH_SOURCE_SIZE, phashFromGrayscale } from "./image-phash";

// ============================================================
// Décodage d'image côté serveur pour le pHash (signal n°3 du dédoublonnage).
//
// SERVEUR UNIQUEMENT — `sharp` est un binaire natif : ce module ne doit jamais
// être importé depuis un composant client. Le calcul pur (DCT, distance de
// Hamming) vit dans lib/image-phash.ts, qui lui est importable partout.
//
// Pourquoi côté serveur et pas dans le navigateur, alors que la photo y est
// déjà décodée (lib/receipt-image-client.ts) : un hachage calculé par le client
// est une donnée envoyée par le client. La règle en vigueur dans
// app/api/orders/route.ts est que RIEN de ce que le client envoie n'influence
// la validation — le serveur ré-analyse le ticket lui-même. Le pHash suit la
// même règle : il est calculé sur l'image que le serveur a reçue.
//
// Tout est best-effort : un échec renvoie `null` et le dédoublonnage se
// contente alors de ses autres signaux (même philosophie que le métering
// ADR 0029 §6 et la conservation des scans ADR 0036).
// ============================================================

/**
 * pHash d'une image de ticket. `null` si l'image n'est pas décodable —
 * jamais d'exception propagée : un ticket ne doit pas être refusé parce que
 * son hachage n'a pas pu être calculé.
 */
export async function computeImagePhash(
  input: ArrayBuffer | Buffer | Uint8Array
): Promise<string | null> {
  try {
    const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input as ArrayBuffer);
    const pixels = await sharp(buffer)
      .greyscale()
      // `fit: "fill"` déforme volontairement : on veut comparer la structure de
      // l'image, pas ses proportions — deux cadrages du même ticket n'ont pas
      // le même rapport largeur/hauteur.
      .resize(PHASH_SOURCE_SIZE, PHASH_SOURCE_SIZE, { fit: "fill" })
      .raw()
      .toBuffer();
    return phashFromGrayscale(pixels);
  } catch (e) {
    console.error("[image-phash] computeImagePhash failed:", (e as Error).message);
    return null;
  }
}

/** Variante pour un `File` de FormData. */
export async function computeImagePhashFromFile(file: File): Promise<string | null> {
  try {
    return await computeImagePhash(await file.arrayBuffer());
  } catch (e) {
    console.error("[image-phash] computeImagePhashFromFile failed:", (e as Error).message);
    return null;
  }
}
