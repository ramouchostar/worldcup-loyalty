// ============================================================
// Réserver un prestataire (ADR 0084 §3 règle 7) — les pièces jointes : quoi accepter, où, combien.
//
// Une pièce jointe est un fichier que l'AUTRE partie va ouvrir : on n'accepte donc que des formats utiles,
// vérifiés sur le CONTENU (les premiers octets), jamais sur l'extension ou le type déclaré seuls — un « logo.png »
// qui est en réalité un programme est refusé. Aucun exécutable, aucun script, aucun fichier avec macros.
// Les fichiers ne sont jamais ouverts dans la page : téléchargement forcé depuis un espace privé.
//
// Fonctions PURES (aucun accès aux données) : le navigateur et le serveur partagent les mêmes règles.
// ============================================================

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_SVG_BYTES = 2 * 1024 * 1024;
/** Un garde-fou de coût : le total des pièces jointes d'une mission. */
export const MAX_MISSION_BYTES = 200 * 1024 * 1024;
export const MAX_NAME_LENGTH = 120;

export type FileScope = "brief" | "proposal" | "retouch";
export const FILE_SCOPES: readonly FileScope[] = ["brief", "proposal", "retouch"];

/** Combien de pièces jointes NON rattachées par portée : brief (10, définitif), idées (9 : 3 par idée), retouche (5 par tour). */
export const MAX_UNLINKED: Record<FileScope, number> = { brief: 10, proposal: 9, retouch: 5 };
/** Par idée, au plus. */
export const MAX_PER_PROPOSAL = 3;

/** Qui peut déposer dans quelle portée. */
export const SCOPE_ACTOR: Record<FileScope, "restaurant" | "provider"> = { brief: "restaurant", proposal: "provider", retouch: "restaurant" };

type Sig = (b: Uint8Array) => boolean;

const startsWith = (b: Uint8Array, ...bytes: number[]) => bytes.every((v, i) => b[i] === v);
const ascii = (b: Uint8Array, at: number, s: string) => s.split("").every((c, i) => b[at + i] === c.charCodeAt(0));
const PDF: Sig = (b) => {
  const head = Array.from(b.slice(0, 1024)).map((c) => String.fromCharCode(c)).join("");
  return head.includes("%PDF-");
};
const ZIP: Sig = (b) => startsWith(b, 0x50, 0x4b, 0x03, 0x04);
const OLE: Sig = (b) => startsWith(b, 0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
const FTYP: Sig = (b) => ascii(b, 4, "ftyp");
const HEIC: Sig = (b) => ascii(b, 4, "ftyp") && ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].some((brand) => ascii(b, 8, brand));
/** Du texte brut : pas d'octet nul dans le début (un binaire déguisé en .txt est refusé). */
const TEXT: Sig = (b) => !Array.from(b.slice(0, 4096)).includes(0);

/** Les formats acceptés : extension → type attendu et signature du contenu. */
export const ALLOWED: Record<string, { mime: string[]; sig: Sig; family: "image" | "document" | "video" | "audio" | "font" | "archive" | "text" }> = {
  jpg: { mime: ["image/jpeg"], sig: (b) => startsWith(b, 0xff, 0xd8, 0xff), family: "image" },
  jpeg: { mime: ["image/jpeg"], sig: (b) => startsWith(b, 0xff, 0xd8, 0xff), family: "image" },
  png: { mime: ["image/png"], sig: (b) => startsWith(b, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), family: "image" },
  gif: { mime: ["image/gif"], sig: (b) => ascii(b, 0, "GIF8"), family: "image" },
  webp: { mime: ["image/webp"], sig: (b) => ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP"), family: "image" },
  heic: { mime: ["image/heic", "image/heif"], sig: HEIC, family: "image" },
  heif: { mime: ["image/heic", "image/heif"], sig: HEIC, family: "image" },
  svg: { mime: ["image/svg+xml"], sig: () => true, family: "image" }, // jugé sur le contenu entier : voir svgIsSafe
  pdf: { mime: ["application/pdf"], sig: PDF, family: "document" },
  ai: { mime: ["application/pdf", "application/postscript", "application/illustrator"], sig: PDF, family: "document" },
  psd: { mime: ["image/vnd.adobe.photoshop", "application/x-photoshop", "application/octet-stream"], sig: (b) => ascii(b, 0, "8BPS"), family: "image" },
  doc: { mime: ["application/msword"], sig: OLE, family: "document" },
  xls: { mime: ["application/vnd.ms-excel"], sig: OLE, family: "document" },
  ppt: { mime: ["application/vnd.ms-powerpoint"], sig: OLE, family: "document" },
  docx: { mime: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"], sig: ZIP, family: "document" },
  xlsx: { mime: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"], sig: ZIP, family: "document" },
  pptx: { mime: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"], sig: ZIP, family: "document" },
  odt: { mime: ["application/vnd.oasis.opendocument.text"], sig: ZIP, family: "document" },
  ods: { mime: ["application/vnd.oasis.opendocument.spreadsheet"], sig: ZIP, family: "document" },
  odp: { mime: ["application/vnd.oasis.opendocument.presentation"], sig: ZIP, family: "document" },
  txt: { mime: ["text/plain"], sig: TEXT, family: "text" },
  csv: { mime: ["text/csv", "application/vnd.ms-excel", "text/plain"], sig: TEXT, family: "text" },
  mp4: { mime: ["video/mp4"], sig: FTYP, family: "video" },
  m4v: { mime: ["video/x-m4v", "video/mp4"], sig: FTYP, family: "video" },
  mov: { mime: ["video/quicktime"], sig: FTYP, family: "video" },
  webm: { mime: ["video/webm"], sig: (b) => startsWith(b, 0x1a, 0x45, 0xdf, 0xa3), family: "video" },
  mp3: { mime: ["audio/mpeg", "audio/mp3"], sig: (b) => ascii(b, 0, "ID3") || (b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0), family: "audio" },
  wav: { mime: ["audio/wav", "audio/x-wav", "audio/wave"], sig: (b) => ascii(b, 0, "RIFF") && ascii(b, 8, "WAVE"), family: "audio" },
  m4a: { mime: ["audio/mp4", "audio/x-m4a", "audio/m4a"], sig: FTYP, family: "audio" },
  ttf: { mime: ["font/ttf", "application/x-font-ttf", "application/octet-stream"], sig: (b) => startsWith(b, 0x00, 0x01, 0x00, 0x00) || ascii(b, 0, "true"), family: "font" },
  otf: { mime: ["font/otf", "application/x-font-opentype", "application/octet-stream"], sig: (b) => ascii(b, 0, "OTTO"), family: "font" },
  woff: { mime: ["font/woff", "application/font-woff"], sig: (b) => ascii(b, 0, "wOFF"), family: "font" },
  woff2: { mime: ["font/woff2", "application/font-woff2"], sig: (b) => ascii(b, 0, "wOF2"), family: "font" },
  zip: { mime: ["application/zip", "application/x-zip-compressed", "application/x-zip"], sig: ZIP, family: "archive" },
};

/** Les extensions qu'on REFUSE en toutes lettres : dites à l'utilisateur, et vérifiées même cachées derrière une double extension. */
export const BLOCKED_EXTENSIONS = new Set([
  "exe", "msi", "bat", "cmd", "com", "scr", "pif", "ps1", "psm1", "vbs", "vbe", "js", "jse", "mjs", "wsf", "wsh", "jar", "apk", "app", "dmg", "pkg", "deb", "rpm", "sh", "bash", "zsh",
  "html", "htm", "xhtml", "shtml", "php", "asp", "aspx", "jsp", "py", "rb", "pl", "lnk", "url", "reg", "dll", "sys", "iso", "img", "hta", "cpl", "chm",
  "docm", "xlsm", "pptm", "dotm", "xlsb", "xla", "xll", "swf", "svgz", "7z", "rar", "tar", "gz",
]);

export function extensionOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const i = base.lastIndexOf(".");
  return i > 0 && i < base.length - 1 ? base.slice(i + 1).toLowerCase() : "";
}

/**
 * Le nom affiché et conservé : sans chemin, sans caractère de contrôle ni de sens de lecture inversé (le truc du
 * « photo{inversion}gpj.exe »), espaces réduits, 120 caractères au plus. Jamais utilisé tel quel comme chemin de stockage.
 */
export function cleanFileName(raw: string): string {
  const base = (raw.split(/[\\/]/).pop() ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (base.length <= MAX_NAME_LENGTH) return base;
  const ext = extensionOf(base);
  const room = MAX_NAME_LENGTH - (ext ? ext.length + 1 : 0);
  return ext ? `${base.slice(0, room)}.${ext}` : base.slice(0, MAX_NAME_LENGTH);
}

export type FileIssue = "no_name" | "blocked" | "unsupported" | "too_big" | "empty" | "type_mismatch" | "svg_too_big" | "content_mismatch" | "svg_unsafe" | "mission_full" | "too_many" | "not_now" | "wrong_actor";

export type UploadRequest = { name: string; size: number; type: string };

/** Ce que le navigateur annonce, jugé AVANT d'envoyer un seul octet. Le contenu réel est jugé après l'envoi (`judgeContent`). */
export function judgeUploadRequest(r: UploadRequest): { ok: true; ext: string; name: string } | { ok: false; issue: FileIssue } {
  const name = cleanFileName(r.name);
  if (!name) return { ok: false, issue: "no_name" };
  const parts = name.toLowerCase().split(".").slice(1);
  if (parts.some((p) => BLOCKED_EXTENSIONS.has(p))) return { ok: false, issue: "blocked" }; // « facture.pdf.exe » comprise
  const ext = extensionOf(name);
  const rule = ALLOWED[ext];
  if (!rule) return { ok: false, issue: "unsupported" };
  if (!Number.isFinite(r.size) || r.size <= 0) return { ok: false, issue: "empty" };
  if (r.size > MAX_FILE_BYTES) return { ok: false, issue: "too_big" };
  if (ext === "svg" && r.size > MAX_SVG_BYTES) return { ok: false, issue: "svg_too_big" };
  // Un type vide ou générique est toléré (certains navigateurs n'en donnent pas) ; un type d'un AUTRE genre est refusé.
  const type = (r.type ?? "").toLowerCase().split(";")[0].trim();
  if (type && type !== "application/octet-stream" && !rule.mime.includes(type)) return { ok: false, issue: "type_mismatch" };
  return { ok: true, ext, name };
}

/** Ce qui rend un SVG dangereux : éléments qui exécutent ou chargent autre chose, gestionnaires d'événements, entités. Une liste, pour la relire d'un coup d'œil. */
const ACTIVE_SVG: readonly RegExp[] = [
  /<(script|foreignObject|iframe|embed|object|audio|video|animate|set)\b/i,
  /\son[a-z]+\s*=/i,
  /<!ENTITY|<!DOCTYPE[^>]*\[/i,
  /(java|vb)script:|data:text\/html/i,
  /href\s*=\s*["']\s*(?!#)/i, // tout renvoi qui n'est pas interne (#id) : image distante, lien, données
];

/** Un SVG est du code (scripts, gestionnaires d'événements, liens externes) : accepté seulement s'il n'en contient aucun. */
export function svgIsSafe(text: string): boolean {
  const t = text.replace(/^\ufeff/, "");
  if (!/<svg[\s>]/i.test(t)) return false;
  return !ACTIVE_SVG.some((re) => re.test(t));
}

/**
 * Le contenu réel, après l'envoi : les premiers octets doivent être ceux du format annoncé (un SVG est lu en entier).
 * `head` = les premiers octets (4 Ko suffisent) ; `svgText` = le texte entier d'un SVG.
 */
export function judgeContent(ext: string, head: Uint8Array, svgText?: string): { ok: true } | { ok: false; issue: FileIssue } {
  const rule = ALLOWED[ext];
  if (!rule) return { ok: false, issue: "unsupported" };
  if (ext === "svg") return svgText !== undefined && svgIsSafe(svgText) ? { ok: true } : { ok: false, issue: "svg_unsafe" };
  return rule.sig(head) ? { ok: true } : { ok: false, issue: "content_mismatch" };
}

/** Le chemin de stockage : jamais le nom donné par l'utilisateur, seulement des identifiants et l'extension jugée sûre. */
export function storagePath(missionId: string, scope: FileScope, fileId: string, ext: string): string {
  return `${missionId}/${scope}/${fileId}.${ext}`;
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}

export const FILE_ISSUE_TEXT: Record<FileIssue, string> = {
  no_name: "Ce fichier n'a pas de nom.",
  blocked: "Ce type de fichier est refusé (programme, script, page web ou fichier avec macros).",
  unsupported: "Ce format n'est pas accepté. Images, PDF, documents Office, vidéo, audio, polices ou .zip : oui.",
  too_big: "Ce fichier dépasse 25 Mo. Pour un fichier plus lourd, partage un lien (WeTransfer, Drive…).",
  empty: "Ce fichier est vide.",
  type_mismatch: "Ce fichier ne ressemble pas à son extension : renomme-le ou exporte-le à nouveau.",
  svg_too_big: "Un fichier .svg ne dépasse pas 2 Mo.",
  content_mismatch: "Le contenu de ce fichier ne correspond pas à son format : il est refusé.",
  svg_unsafe: "Ce fichier .svg contient du code actif : exporte-le en PNG ou en PDF.",
  mission_full: "Cette mission a atteint 200 Mo de pièces jointes : retire-en une, ou partage un lien.",
  too_many: "Tu as atteint le nombre maximal de pièces jointes ici.",
  not_now: "On ne peut plus ajouter de pièce jointe à ce stade.",
  wrong_actor: "Tu ne peux pas ajouter de pièce jointe ici.",
};

/** Le texte du sélecteur : les formats acceptés, en mots simples. */
export const ACCEPTED_TEXT = "Images, PDF, documents Office, vidéo, audio, polices, .zip — 25 Mo par fichier. Pas de programmes ni de scripts.";

/** Pour l'attribut `accept` du sélecteur de fichiers (la vraie vérification reste côté serveur). */
export const ACCEPT_ATTR = Object.keys(ALLOWED).map((e) => `.${e}`).join(",");

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/** La liste d'identifiants envoyée par le réseau : des uuid distincts, au plus `max`. */
export function sanitizeIds(raw: unknown, max: number): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter(isUuid).map((x) => x.toLowerCase()))].slice(0, max);
}

export type AttachmentView = { id: string; name: string; size: number; family: (typeof ALLOWED)[string]["family"] };

export function familyOf(name: string): AttachmentView["family"] {
  return ALLOWED[extensionOf(name)]?.family ?? "document";
}
