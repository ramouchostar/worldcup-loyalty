// Aperçu des gabarits d'e-mail des séquences, avec les données d'exemple de
// lib/email-templates/fixtures.ts (établissement fictif).
//
//   npx tsx scripts/email-preview.ts [dossier]      (défaut : .email-preview/)
//
// Écrit un .html par e-mail et un emails.json (sujet, pré-en-tête, texte,
// message court). Les images sont intégrées en data: URI, converties en PNG
// comme elles le seront à l'envoi (WebP n'est pas lu par Outlook) : le
// fichier s'ouvre hors ligne et montre ce que verra la boîte de réception.

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { defaultImage, previewEntries } from "../lib/email-templates/fixtures";

const outDir = path.resolve(process.argv[2] ?? ".email-preview");

async function pngDataUri(input: Buffer, height: number): Promise<string> {
  const png = await sharp(input).resize({ height, withoutEnlargement: false }).png().toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="64" viewBox="0 0 300 64">
  <circle cx="32" cy="32" r="28" fill="#D8641B"/>
  <path d="M21 38c0-9 6-16 13-16 5 0 9 3 10 7l4-2-2 5c1 7-5 13-13 13-7 0-12-3-12-7z" fill="#FFF3E6"/>
  <circle cx="38" cy="30" r="2" fill="#2E1A0C"/>
  <text x="72" y="42" font-family="Georgia, serif" font-size="30" font-weight="700" fill="#2E1A0C">Poulet Doré</text>
</svg>`;

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const logoUrl = await pngDataUri(Buffer.from(LOGO_SVG), 60);

  // Première passe pour connaître les plats illustrés, puis téléchargement.
  const wanted = new Set<string>();
  previewEntries({ logoUrl, image: (n) => (wanted.add(n), null) });
  const images = new Map<string, string>();
  for (const name of wanted) {
    const url = defaultImage(name);
    const res = await fetch(url);
    if (!res.ok) continue;
    images.set(name, await pngDataUri(Buffer.from(await res.arrayBuffer()), 128));
  }

  const entries = previewEntries({ logoUrl, image: (n) => images.get(n) ?? null });
  for (const e of entries) fs.writeFileSync(path.join(outDir, `${e.id}.html`), e.email.html);
  fs.writeFileSync(path.join(outDir, "emails.json"), JSON.stringify(entries, null, 2));
  console.log(`${entries.length} e-mails → ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
