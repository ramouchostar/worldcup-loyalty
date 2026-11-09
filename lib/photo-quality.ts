// ============================================================
// Contrôle gratuit de la photo AVANT l'envoi (ADR 0092) — pur, testé.
//
// Une photo noire ou très floue coûte une lecture payante (jusqu'à deux : Sonnet puis Fable) pour un
// refus certain, et le membre attend ~10 s pour s'entendre dire « reprends ». On la voit en
// quelques millisecondes sur le téléphone, et on le dit tout de suite.
//
// Seuils MESURÉS (2026-11-09), image réduite à 640 px de large, niveaux de gris, variance du
// laplacien à 4 voisins :
//   · sur les 188 photos des 30 derniers jours : flou < 40 retient 7 des 14 photos dont ni total
//     ni clé n'ont été lus, et 1 des 96 photos qui ont donné une commande ;
//   · sur les 436 photos gelées (fonction réelle) : 10 des 52 photos « rien lu » (19 %) et 4 des
//     205 envois réussis (2 %) — ces 4 reprennent une photo, jamais plus (second essai libre) ;
//   · noir (luminosité moyenne < 20) : la seule photo quasi noire (0) n'a rien donné. Les photos
//     sombres de 44 à 74 ont presque toutes livré leur total : on ne les bloque PAS.
// Gain réel : environ 2 % des photos reçues arrêtées avant la lecture payante — modeste, mais sans
// attente de 10 s. La cause principale des refus (clé hors cadre) n'est PAS traitée ici : ni le flou
// ni la lumière ne la voient.
// Non mesuré donc non construit : « ticket trop petit dans le cadre ».
//
// Jamais de piège : un faux positif coûte une reprise de photo, pas plus — un second essai flou
// passe toujours (`shouldBlockPhoto`).
// ============================================================

export const PHOTO_BLUR_MAX = 40;
export const PHOTO_DARK_MAX = 20;
/** Largeur de mesure : celle des seuils ci-dessus. */
export const PHOTO_MEASURE_WIDTH = 640;

export type PhotoQuality = "ok" | "blurry" | "dark";
export type PhotoMetrics = { mean: number; sharpness: number };

/**
 * Luminosité moyenne et netteté (variance du laplacien) d'une image en niveaux de gris,
 * `data` = un octet par pixel, ligne après ligne.
 */
export function measureGray(data: ArrayLike<number>, width: number, height: number): PhotoMetrics {
  const n = width * height;
  if (n === 0 || data.length < n) return { mean: 255, sharpness: Infinity }; // illisible : ne bloque pas
  let sum = 0;
  for (let i = 0; i < n; i++) sum += data[i];
  let count = 0, s = 0, s2 = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const l = 4 * data[i] - data[i - 1] - data[i + 1] - data[i - width] - data[i + width];
      s += l;
      s2 += l * l;
      count++;
    }
  }
  const mu = count ? s / count : 0;
  return { mean: sum / n, sharpness: count ? s2 / count - mu * mu : Infinity };
}

export function judgePhotoQuality(m: PhotoMetrics): PhotoQuality {
  if (m.mean < PHOTO_DARK_MAX) return "dark";
  if (m.sharpness < PHOTO_BLUR_MAX) return "blurry";
  return "ok";
}

/** Un premier contrôle raté bloque ; un second de suite laisse passer (le serveur tranchera). */
export function shouldBlockPhoto(quality: PhotoQuality, previousBlocks: number): boolean {
  return quality !== "ok" && previousBlocks < 1;
}

export const PHOTO_QUALITY_MESSAGES: Record<Exclude<PhotoQuality, "ok">, { title: string; hint: string }> = {
  blurry: {
    title: "La photo est floue",
    hint: "Tiens le téléphone bien stable, ticket à plat, et reprends-la de près.",
  },
  dark: {
    title: "La photo est trop sombre",
    hint: "Mets le ticket à la lumière, sans ombre dessus, et reprends-la.",
  },
};
