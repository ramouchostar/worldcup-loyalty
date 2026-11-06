// Génère la page A4 « à laisser au comptoir » (kit de visite, /platform/kit).
// Le PDF servi est public/marketing/boosteats-page-comptoir.pdf : à refaire
// après tout changement de prix ou d'offre (lib/visit-kit.ts PLANS).
//   node scripts/marketing/build-page-comptoir.mjs . /tmp/page.html
//   "Google Chrome" --headless=new --no-pdf-header-footer --virtual-time-budget=8000 \
//     --print-to-pdf=public/marketing/boosteats-page-comptoir.pdf file:///tmp/page.html
// Le QR mène à l'analyse gratuite avec utm_source=flyer : les scans du papier
// se comptent à part dans GA4.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [worktree, out] = process.argv.slice(2);
const require = createRequire(join(worktree, "package.json"));
const QRCode = require("qrcode");

const AUDIT_URL = "https://www.boosteats.be/audit-gratuit?utm_source=flyer&utm_medium=print&utm_campaign=page-comptoir";
const WHATSAPP = "+32 490 11 31 67";
const qr = await QRCode.toString(AUDIT_URL, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#0C1509", light: "#FFFFFF" } });
const logo = readFileSync(join(worktree, "public/brand/boosteats-logo-horizontal-clair.svg"), "utf8");

// Charte anti-slop (ADR 0090) : Instrument Sans, olive seul accent, aplats unis.
// Contenu aligné sur la landing et lib/visit-kit.ts (brigade, comparatif).
const portrait = (id) => `data:image/jpeg;base64,${readFileSync(join(worktree, `public/marketing/brigade/${id}.jpg`)).toString("base64")}`;
const pillars = [
  [["lea", "hugo"], "Léa et Hugo font revenir vos clients", "Vos clients prennent leur ticket en photo, gagnent des points et choisissent leur cadeau. Hugo écrit à ceux qui ne reviennent plus, quand vous avez dit oui."],
  [["emma"], "Emma fait venir le quartier", "Elle lance et gère vos publicités en ligne, à 3 km autour de chez vous. Une estimation avant de payer, une offre et un mot clé à dire au comptoir."],
  [["chloe"], "Chloé suit vos chiffres", "Votre chiffre du jour en un écran, le coût de chaque plat, et vos jours calmes repérés pour que Hugo et Emma s'en occupent."],
];
const plans = [
  ["Gratuit", "0 €, pour toujours", ["lea", "hugo", "chloe", "emma"], ["Affiche et QR au comptoir", "Cadeaux calculés sur vos coûts", "Jusqu'à 500 tickets par mois"], "Pub en ligne : 20 % de frais"],
  ["Croissance", "150 €/mois, sans engagement", ["louis"], ["Tout le Gratuit", "Louis répond à vos avis Google", "Tickets illimités, chiffres comparés"], "Pub en ligne : 15 % de frais"],
  ["Pro", "500 €/mois, 3 mois minimum", ["nina", "max"], ["Toute la brigade", "Nina et Max, en pilote", "Un rapport et un point chaque mois"], "Pub en ligne : 5 % de frais"],
];
const faces = (ids, size) => `<span class="faces">${ids.map((id) => `<img src="${portrait(id)}" style="width:${size}mm;height:${size}mm" alt="">`).join("")}</span>`;

const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Boosteats, page à laisser au comptoir</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&display=block" rel="stylesheet">
<style>
@page { size: A4; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
:root { --night:#0C1509; --olive:#6B7C3F; --olive-dark:#4F5C2D; --light:#A9BB6E; --cream:#EFF1E4; --ink:#15170F; --muted:#5C6057; --line:#E4E6DF; --soft:#F5F6F2; }
html, body { width: 210mm; height: 297mm; }
body { font-family: "Instrument Sans", system-ui, sans-serif; color: var(--ink); background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 210mm; height: 297mm; display: flex; flex-direction: column; overflow: hidden; }
.top { background: var(--night); color: #fff; padding: 8mm 14mm 6mm; }
.logo svg { height: 9mm; width: auto; }
h1 { font-weight: 600; font-size: 24pt; line-height: 1.06; letter-spacing: -0.025em; margin-top: 5mm; max-width: 170mm; }
.sub { margin-top: 3mm; font-size: 11pt; color: #D9DECB; }
.body { padding: 6mm 14mm 5mm; flex: 1; display: flex; flex-direction: column; gap: 3mm; }
.faces { display: inline-flex; }
.faces img { border-radius: 50%; object-fit: cover; border: 0.6mm solid #fff; margin-left: -2mm; }
.faces img:first-child { margin-left: 0; }
.pillars { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; }
.pillar { background: var(--soft); border-radius: 2mm; padding: 3.5mm; }
.pillar h2 { font-size: 12.5pt; font-weight: 600; line-height: 1.2; margin-top: 2.5mm; letter-spacing: -0.01em; }
.pillar p { font-size: 8.8pt; line-height: 1.4; color: var(--muted); margin-top: 1.5mm; }
.gifts { display: grid; grid-template-columns: auto 1fr; gap: 5mm; align-items: center; background: var(--cream); border-radius: 2mm; padding: 3mm 5mm; }
.calc { font-weight: 600; font-size: 14pt; white-space: nowrap; color: var(--olive-dark); }
.calc span { display:inline-block; background:#fff; border-radius: 1.5mm; padding: 1mm 2.5mm; color: var(--ink); }
.gifts p { font-size: 9pt; line-height: 1.45; }
.gifts p b { font-weight: 600; }
.plans { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; }
.plan { border: 0.3mm solid var(--line); border-radius: 2mm; padding: 3.5mm; display:flex; flex-direction:column; }
.plan.free { border: 0.6mm solid var(--olive); }
.plan h3 { font-size: 14pt; font-weight: 600; }
.plan .price { font-size: 9.5pt; font-weight: 600; color: var(--olive-dark); margin-top: .5mm; }
.plan .who { margin-top: 2.5mm; }
.plan ul { list-style: none; margin-top: 2.5mm; display:flex; flex-direction:column; gap: 1.3mm; flex:1; }
.plan li { font-size: 9pt; line-height: 1.35; padding-left: 4mm; position: relative; }
.plan li::before { content:""; position:absolute; left:0; top: 1.2mm; width: 2.4mm; height: 1.3mm; border-left: 0.5mm solid var(--olive-dark); border-bottom: 0.5mm solid var(--olive-dark); transform: rotate(-45deg); }
.plan .fee { margin-top: 2.5mm; font-size: 8.4pt; color: var(--muted); border-top: 0.3mm solid var(--line); padding-top: 2mm; }
.ht { font-size: 8.4pt; color: var(--muted); margin-top: -1.5mm; }
.ht b { color: var(--ink); font-weight: 600; }
.proof { display:grid; grid-template-columns: auto 1fr; gap: 5mm; align-items:center; background: var(--soft); border-radius: 2mm; padding: 3mm 5mm; }
.proof .nums { font-weight: 600; font-size: 14pt; white-space: nowrap; }
.proof .nums b { color: var(--olive-dark); font-weight: 600; }
.proof .nums small { display:block; font-size: 8.6pt; font-weight: 500; color: var(--muted); }
.proof p { font-size: 9pt; line-height: 1.45; color: var(--muted); }
.proof p strong { color: var(--ink); font-weight: 600; }
.cta { margin-top: auto; background: var(--night); color: #fff; padding: 5mm 14mm; display: grid; grid-template-columns: 1fr auto; gap: 8mm; align-items: center; }
.cta h4 { font-size: 16pt; font-weight: 600; line-height: 1.15; letter-spacing: -0.02em; }
.cta p { font-size: 9.4pt; color: #C9CEBB; margin-top: 2.5mm; line-height: 1.5; }
.contact { display:flex; gap: 7mm; margin-top: 3mm; font-size: 11pt; font-weight: 600; }
.contact span small { display:block; font-size: 8pt; font-weight: 500; color: var(--light); }
.qr { background:#fff; border-radius: 2mm; padding: 2.5mm; width: 32mm; text-align:center; }
.qr svg { width: 27mm; height: 27mm; display:block; }
.qr small { display:block; color: var(--night); font-size: 7.6pt; font-weight: 600; margin-top: 1.5mm; }
</style></head>
<body><div class="page">
  <div class="top">
    <div class="logo">${logo.replace(/<title>.*?<\/title>/, "")}</div>
    <h1>Votre brigade marketing.<br>Vous validez en cinq minutes par jour.</h1>
    <p class="sub">Chaque matin, des idées prêtes pour faire monter votre chiffre d'affaires. Rien à brancher : le ticket de caisse suffit.</p>
  </div>
  <div class="body">
    <div class="pillars">${pillars.map(([ids, t, p]) => `<div class="pillar">${faces(ids, 10)}<h2>${t}</h2><p>${p}</p></div>`).join("")}</div>
    <div class="gifts">
      <div class="calc"><span>0,60 €</span> ÷ 8 % = <span>7,50 €</span></div>
      <p><b>Chaque cadeau est calculé sur ce qu'il vous coûte, au taux que vous choisissez (4 à 12 %).</b><br>À 8 %, une boisson qui vous coûte 0,60 € se gagne après 7,50 € d'achats chez vous.</p>
    </div>
    <div class="plans">${plans.map(([name, price, ids, items, fee], i) => `<div class="plan${i === 0 ? " free" : ""}"><h3>${name}</h3><p class="price">${price}</p><div class="who">${faces(ids, 7)}</div><ul>${items.map((x) => `<li>${x}</li>`).join("")}</ul><p class="fee">${fee}</p></div>`).join("")}</div>
    <p class="ht">Prix HTVA, par établissement. On commence toujours par le Gratuit. <b>Pris chez des spécialistes, ces postes coûtent environ 770 € par mois.</b> Rien ne part sans votre oui.</p>
    <div class="proof">
      <div class="nums">63 000 € → <b>123 000 €</b><small>de chiffre d'affaires par mois</small></div>
      <p><strong>Belchicken Kraainem, client depuis plus d'un an.</strong> Des milliers de clients inscrits et relancés chaque semaine, le chiffre lu jour par jour, les bonnes promos au bon moment, et de la pub dans le quartier toute l'année.</p>
    </div>
  </div>
  <div class="cta">
    <div>
      <h4>Analysez votre restaurant gratuitement, en une minute.</h4>
      <p>Votre fiche Google, vos avis, vos voisins sur Google Maps : une note sur 100, puis le rapport complet et vos 5 priorités sur WhatsApp.</p>
      <div class="contact"><span><small>En ligne</small>boosteats.be/audit-gratuit</span><span><small>WhatsApp</small>${WHATSAPP}</span></div>
    </div>
    <div class="qr">${qr}<small>Scannez pour l'analyse</small></div>
  </div>
</div></body></html>`;

writeFileSync(out, html);
console.log("ok", out);
