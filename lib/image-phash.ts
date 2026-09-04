// ============================================================
// Hachage perceptuel d'image (pHash) — signal n°3 du dédoublonnage.
//
// Deux photos du MÊME ticket, prises à quelques secondes d'intervalle, ont des
// octets entièrement différents (compression, exposition, cadrage) mais la même
// structure de luminance. Un pHash capture cette structure : on réduit l'image
// à 32×32 en niveaux de gris, on en prend la transformée en cosinus discrète,
// et on garde le signe des 64 coefficients basse fréquence par rapport à leur
// médiane. Deux photos du même sujet donnent des hachages à faible distance de
// Hamming ; deux tickets différents s'en éloignent nettement.
//
// CE MODULE EST PUR — aucune dépendance, aucun I/O, donc importable partout
// (le moteur de décision en dépend). Le décodage de l'image, lui, vit dans
// lib/image-phash-server.ts, qui n'est appelé que depuis les routes serveur.
// ============================================================

/** Côté de l'image réduite avant DCT. */
export const PHASH_SOURCE_SIZE = 32;
/** Côté du bloc de coefficients basse fréquence retenu (64 bits au total). */
export const PHASH_BLOCK_SIZE = 8;

// Table de cosinus précalculée : cos(pi/N * (n + 0.5) * k) pour n < 32, k < 8.
// 256 valeurs, calculées une fois au chargement du module.
const COS_TABLE: number[][] = (() => {
  const table: number[][] = [];
  for (let n = 0; n < PHASH_SOURCE_SIZE; n++) {
    const row: number[] = [];
    for (let k = 0; k < PHASH_BLOCK_SIZE; k++) {
      row.push(Math.cos((Math.PI / PHASH_SOURCE_SIZE) * (n + 0.5) * k));
    }
    table.push(row);
  }
  return table;
})();

/**
 * pHash d'une image déjà réduite à 32×32 niveaux de gris (un octet par pixel,
 * ligne par ligne). Retourne 16 caractères hexadécimaux (64 bits), ou `null`
 * si le tampon n'a pas la taille attendue.
 *
 * DCT-II séparable : on transforme d'abord chaque ligne (32 → 8 coefficients),
 * puis chaque colonne du résultat. Le coefficient continu (0,0) est écarté :
 * il ne porte que la luminosité moyenne, c'est-à-dire l'exposition de la photo,
 * exactement ce qu'on veut ignorer.
 */
export function phashFromGrayscale(pixels: ArrayLike<number>): string | null {
  const N = PHASH_SOURCE_SIZE;
  const K = PHASH_BLOCK_SIZE;
  if (pixels.length !== N * N) return null;

  // Lignes : 32 lignes × 8 coefficients.
  const rows = new Float64Array(N * K);
  for (let y = 0; y < N; y++) {
    for (let k = 0; k < K; k++) {
      let sum = 0;
      for (let x = 0; x < N; x++) sum += pixels[y * N + x] * COS_TABLE[x][k];
      rows[y * K + k] = sum;
    }
  }

  // Colonnes : 8 × 8 coefficients basse fréquence.
  const block = new Float64Array(K * K);
  for (let k = 0; k < K; k++) {
    for (let j = 0; j < K; j++) {
      let sum = 0;
      for (let y = 0; y < N; y++) sum += rows[y * K + k] * COS_TABLE[y][j];
      block[j * K + k] = sum;
    }
  }

  // Médiane des 63 coefficients (hors continu) — plus robuste que la moyenne,
  // qu'un seul coefficient aberrant suffirait à déplacer.
  const withoutDc: number[] = [];
  for (let i = 1; i < K * K; i++) withoutDc.push(block[i]);
  const sorted = [...withoutDc].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  // 64 bits : le continu est mis à 0 pour garder un hachage de longueur fixe.
  let hex = "";
  for (let nibble = 0; nibble < 16; nibble++) {
    let value = 0;
    for (let bit = 0; bit < 4; bit++) {
      const i = nibble * 4 + bit;
      const on = i > 0 && block[i] > median;
      value = (value << 1) | (on ? 1 : 0);
    }
    hex += value.toString(16);
  }
  return hex;
}

const HEX_RE = /^[0-9a-f]{16}$/i;

const BITS_SET: Uint8Array = (() => {
  const t = new Uint8Array(16);
  for (let i = 0; i < 16; i++) t[i] = ((i >> 3) & 1) + ((i >> 2) & 1) + ((i >> 1) & 1) + (i & 1);
  return t;
})();

/**
 * Distance de Hamming entre deux pHash hexadécimaux (0 = identiques, 64 = tout
 * oppose). `null` si l'un des deux n'est pas un hachage valide — l'appelant
 * doit alors se taire, pas supposer une ressemblance.
 */
export function hammingDistanceHex(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (!HEX_RE.test(x) || !HEX_RE.test(y)) return null;

  let distance = 0;
  for (let i = 0; i < 16; i++) {
    distance += BITS_SET[parseInt(x[i], 16) ^ parseInt(y[i], 16)];
  }
  return distance;
}
