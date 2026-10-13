import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ACCEPT_ATTR,
  ALLOWED,
  BLOCKED_EXTENSIONS,
  FILE_ISSUE_TEXT,
  FILE_SCOPES,
  MAX_FILE_BYTES,
  MAX_MISSION_BYTES,
  MAX_NAME_LENGTH,
  MAX_UNLINKED,
  SCOPE_ACTOR,
  cleanFileName,
  extensionOf,
  humanSize,
  judgeContent,
  judgeUploadRequest,
  sanitizeIds,
  storagePath,
  svgIsSafe,
} from "./mission-files";

const bytes = (...b: number[]) => Uint8Array.from(b);
const ascii = (s: string, pad = 0) => Uint8Array.from([...Array.from({ length: pad }, () => 0), ...s.split("").map((c) => c.charCodeAt(0))]);
const MB = 1024 * 1024;

// ── ce que le navigateur annonce ──
test("les formats utiles sont acceptés, avec leur type habituel ou sans type", () => {
  const ok = (name: string, type = "") => assert.equal(judgeUploadRequest({ name, size: 1000, type }).ok, true, name);
  ok("logo.png", "image/png");
  ok("photo.JPG", "image/jpeg");
  ok("plat.heic", "image/heic");
  ok("charte.pdf", "application/pdf");
  ok("menu.docx");
  ok("budget.xlsx", "application/octet-stream");
  ok("extrait.mp4", "video/mp4");
  ok("ambiance.mp3", "audio/mpeg");
  ok("police.woff2");
  ok("police.otf");
  ok("projet.zip", "application/x-zip-compressed");
  ok("fiche.csv", "text/csv; charset=utf-8");
});

test("un programme, un script, une page web ou un fichier à macros est refusé, même caché derrière une double extension", () => {
  const issue = (name: string) => {
    const j = judgeUploadRequest({ name, size: 1000, type: "" });
    return j.ok ? null : j.issue;
  };
  for (const n of ["setup.exe", "install.msi", "run.bat", "x.ps1", "x.js", "page.html", "x.php", "x.sh", "x.jar", "x.apk", "x.lnk", "x.dll", "budget.xlsm", "contrat.docm", "archive.rar", "archive.7z", "x.svgz"]) assert.equal(issue(n), "blocked", n);
  assert.equal(issue("facture.pdf.exe"), "blocked");
  assert.equal(issue("photo.jpg.js"), "blocked");
  assert.equal(issue("photo.png.html"), "blocked");
  assert.equal(issue("inconnu.xyz"), "unsupported");
  assert.equal(issue("sans-extension"), "unsupported");
});

test("les extensions refusées et les formats acceptés ne se recoupent jamais", () => {
  for (const ext of Object.keys(ALLOWED)) assert.equal(BLOCKED_EXTENSIONS.has(ext), false, ext);
});

test("taille : 25 Mo au plus, jamais vide ; un SVG ne dépasse pas 2 Mo", () => {
  const j = (name: string, size: number) => {
    const r = judgeUploadRequest({ name, size, type: "" });
    return r.ok ? "ok" : r.issue;
  };
  assert.equal(j("a.pdf", MAX_FILE_BYTES), "ok");
  assert.equal(j("a.pdf", MAX_FILE_BYTES + 1), "too_big");
  assert.equal(j("a.pdf", 0), "empty");
  assert.equal(j("a.pdf", Number.NaN), "empty");
  assert.equal(j("a.pdf", -5), "empty");
  assert.equal(j("a.svg", 2 * MB), "ok");
  assert.equal(j("a.svg", 2 * MB + 1), "svg_too_big");
});

test("un type d'un autre genre que l'extension est refusé ; vide ou générique toléré", () => {
  const j = (name: string, type: string) => judgeUploadRequest({ name, size: 10, type });
  assert.deepEqual(j("logo.png", "application/x-msdownload"), { ok: false, issue: "type_mismatch" });
  assert.deepEqual(j("logo.png", "text/html"), { ok: false, issue: "type_mismatch" });
  assert.equal(j("logo.png", "").ok, true);
  assert.equal(j("logo.png", "application/octet-stream").ok, true);
});

test("le nom : sans chemin, sans caractère de contrôle ni sens de lecture inversé, espaces réduits, 120 caractères", () => {
  assert.equal(cleanFileName("C:\\Users\\moi\\Bureau\\logo.png"), "logo.png");
  assert.equal(cleanFileName("../../etc/passwd.txt"), "passwd.txt");
  assert.equal(cleanFileName("  mon   logo \n final.png "), "mon logo final.png");
  assert.equal(cleanFileName("photo\u202Egpj.exe"), "photogpj.exe"); // le truc du sens inversé : le .exe reste visible, donc refusé
  assert.equal(judgeUploadRequest({ name: "photo\u202Egpj.exe", size: 10, type: "" }).ok, false);
  const long = cleanFileName("a".repeat(300) + ".pdf");
  assert.equal(long.length, MAX_NAME_LENGTH);
  assert.ok(long.endsWith(".pdf"));
  assert.equal(cleanFileName("\u0000\u0001"), "");
  assert.deepEqual(judgeUploadRequest({ name: "", size: 10, type: "" }), { ok: false, issue: "no_name" });
});

test("l'extension est lue sur le dernier point, jamais sur un fichier caché", () => {
  assert.equal(extensionOf("a.b.PDF"), "pdf");
  assert.equal(extensionOf(".htaccess"), "");
  assert.equal(extensionOf("fin."), "");
  assert.equal(extensionOf("dossier/fichier.png"), "png");
});

// ── le contenu réel ──
test("le contenu doit être celui du format annoncé : un programme renommé en .png est refusé", () => {
  const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0);
  const mz = ascii("MZ\x90\x00\x03");
  assert.deepEqual(judgeContent("png", png), { ok: true });
  assert.deepEqual(judgeContent("png", mz), { ok: false, issue: "content_mismatch" });
  assert.deepEqual(judgeContent("jpg", mz), { ok: false, issue: "content_mismatch" });
  assert.deepEqual(judgeContent("pdf", mz), { ok: false, issue: "content_mismatch" });
  assert.deepEqual(judgeContent("mp4", mz), { ok: false, issue: "content_mismatch" });
  assert.deepEqual(judgeContent("docx", mz), { ok: false, issue: "content_mismatch" });
});

test("les signatures des formats courants", () => {
  assert.deepEqual(judgeContent("jpg", bytes(0xff, 0xd8, 0xff, 0xe0)), { ok: true });
  assert.deepEqual(judgeContent("gif", ascii("GIF89a")), { ok: true });
  assert.deepEqual(judgeContent("webp", ascii("RIFF\0\0\0\0WEBPVP8 ")), { ok: true });
  assert.deepEqual(judgeContent("pdf", ascii("%PDF-1.7\n")), { ok: true });
  assert.deepEqual(judgeContent("pdf", ascii("%PDF-1.7\n", 0)), { ok: true });
  assert.deepEqual(judgeContent("ai", ascii("%PDF-1.5")), { ok: true });
  assert.deepEqual(judgeContent("psd", ascii("8BPS")), { ok: true });
  assert.deepEqual(judgeContent("docx", bytes(0x50, 0x4b, 0x03, 0x04)), { ok: true });
  assert.deepEqual(judgeContent("zip", bytes(0x50, 0x4b, 0x03, 0x04)), { ok: true });
  assert.deepEqual(judgeContent("doc", bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)), { ok: true });
  assert.deepEqual(judgeContent("mp4", ascii("\0\0\0\x18ftypmp42")), { ok: true });
  assert.deepEqual(judgeContent("mov", ascii("\0\0\0\x14ftypqt  ")), { ok: true });
  assert.deepEqual(judgeContent("heic", ascii("\0\0\0\x18ftypheic")), { ok: true });
  assert.deepEqual(judgeContent("heic", ascii("\0\0\0\x18ftypmp42")), { ok: false, issue: "content_mismatch" }); // une vidéo n'est pas une photo HEIC
  assert.deepEqual(judgeContent("webm", bytes(0x1a, 0x45, 0xdf, 0xa3)), { ok: true });
  assert.deepEqual(judgeContent("mp3", ascii("ID3\x04")), { ok: true });
  assert.deepEqual(judgeContent("mp3", bytes(0xff, 0xfb, 0x90, 0x00)), { ok: true });
  assert.deepEqual(judgeContent("wav", ascii("RIFF\0\0\0\0WAVEfmt ")), { ok: true });
  assert.deepEqual(judgeContent("ttf", bytes(0, 1, 0, 0, 0, 0)), { ok: true });
  assert.deepEqual(judgeContent("otf", ascii("OTTO\0")), { ok: true });
  assert.deepEqual(judgeContent("woff2", ascii("wOF2")), { ok: true });
  assert.deepEqual(judgeContent("inconnu", ascii("x")), { ok: false, issue: "unsupported" });
});

test("un texte brut ne contient pas d'octet nul : un binaire déguisé en .txt ou .csv est refusé", () => {
  assert.deepEqual(judgeContent("txt", ascii("Bonjour, voici le menu.\n")), { ok: true });
  assert.deepEqual(judgeContent("csv", ascii("plat;prix\nburger;12\n")), { ok: true });
  assert.deepEqual(judgeContent("txt", ascii("MZ\x90\x00\x03\x00")), { ok: false, issue: "content_mismatch" });
});

test("un SVG est du code : accepté seulement sans script, gestionnaire d'événement, objet externe ni entité", () => {
  const ok = '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10z" fill="#123"/></svg>';
  assert.equal(svgIsSafe(ok), true);
  assert.equal(svgIsSafe('<svg xmlns="http://www.w3.org/2000/svg"><use href="#a"/></svg>'), true); // renvoi interne autorisé
  for (const bad of [
    '<svg><script>alert(1)</script></svg>',
    '<svg onload="alert(1)"></svg>',
    '<svg><a href="javascript:alert(1)"><text>x</text></a></svg>',
    '<svg><foreignObject><iframe src="https://x"/></foreignObject></svg>',
    '<svg><image href="https://evil.example/pixel.png"/></svg>',
    '<svg><image xlink:href="https://evil.example/pixel.png"/></svg>',
    '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x "y">]><svg>&x;</svg>',
    '<svg><set attributeName="href" to="javascript:alert(1)"/></svg>',
    "<html><body>pas un svg</body></html>",
    "",
  ])
    assert.equal(svgIsSafe(bad), false, bad.slice(0, 40));
  assert.deepEqual(judgeContent("svg", new Uint8Array(), ok), { ok: true });
  assert.deepEqual(judgeContent("svg", new Uint8Array(), "<svg onload=x>"), { ok: false, issue: "svg_unsafe" });
  assert.deepEqual(judgeContent("svg", new Uint8Array()), { ok: false, issue: "svg_unsafe" }); // jamais jugé sans son texte
});

// ── le reste ──
test("le chemin de stockage ne contient jamais le nom donné par l'utilisateur", () => {
  const p = storagePath("m-1", "brief", "f-1", "png");
  assert.equal(p, "m-1/brief/f-1.png");
  assert.doesNotMatch(p, /\.\./);
});

test("les identifiants venus du réseau : des uuid distincts, au plus N", () => {
  const a = "123e4567-e89b-42d3-a456-426614174000";
  const b = "123E4567-E89B-42D3-A456-426614174001";
  assert.deepEqual(sanitizeIds([a, a, b, "pas-un-uuid", 5, null], 5), [a, b.toLowerCase()]);
  assert.deepEqual(sanitizeIds([a, b], 1), [a]);
  assert.deepEqual(sanitizeIds("x", 3), []);
  assert.deepEqual(sanitizeIds(undefined, 3), []);
});

test("les tailles se lisent en français", () => {
  assert.equal(humanSize(900), "900 o");
  assert.equal(humanSize(2048), "2 Ko");
  assert.equal(humanSize(5 * MB + MB / 2), "5,5 Mo");
});

test("qui dépose où, et combien : le brief et les retouches au restaurateur, les idées au prestataire", () => {
  assert.deepEqual(SCOPE_ACTOR, { brief: "restaurant", proposal: "provider", retouch: "restaurant" });
  assert.deepEqual([...FILE_SCOPES].sort(), Object.keys(MAX_UNLINKED).sort());
  assert.ok(MAX_MISSION_BYTES >= MAX_FILE_BYTES * 4);
});

test("chaque motif a sa phrase, et le sélecteur propose chaque format accepté", () => {
  for (const k of Object.keys(FILE_ISSUE_TEXT)) assert.ok((FILE_ISSUE_TEXT as Record<string, string>)[k].length > 15, k);
  for (const ext of Object.keys(ALLOWED)) assert.ok(ACCEPT_ATTR.split(",").includes(`.${ext}`), ext);
  assert.equal(ACCEPT_ATTR.includes(".exe"), false);
});

// ── la migration ──
test("la migration : espace privé, limite de 25 Mo, portées et dépositaires comme le code", () => {
  const sql = readFileSync("docs/migrations/20261013-1300-prestataires-pieces-jointes.sql", "utf8");
  assert.match(sql, /'mission-files', 'mission-files', false, 26214400/);
  assert.equal(26214400, MAX_FILE_BYTES);
  for (const s of FILE_SCOPES) assert.ok(sql.includes(`'${s}'`), s);
  assert.match(sql, /uploaded_by\s+TEXT NOT NULL CHECK \(uploaded_by IN \('restaurant', 'provider'\)\)/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(sql, /CREATE POLICY/); // aucune policy : le bucket n'est lisible que par le serveur
});
