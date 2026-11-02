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

const pillars = [
  ["Faire revenir", "Vos clients prennent leur ticket de caisse en photo, gagnent des points et choisissent leur cadeau. Vous récupérez leur contact et vous leur écrivez quand vous voulez."],
  ["Faire venir", "Une pub Facebook et Instagram dans votre quartier, montée pour vous. Une estimation avant de payer, une offre et un mot clé à dire au comptoir."],
  ["Garder la main", "Votre chiffre du jour en un écran. Le prix de revient et la marge de chaque plat. La part de vos ventes qui vient de vos clients inscrits."],
];
const plans = [
  ["Forfait gratuit", "Pour toujours", "Inscrivez vos clients", ["Affiche et QR au comptoir", "Cadeaux calculés sur vos coûts", "Jusqu'à 500 tickets par mois"], "Pub : 20 % de frais"],
  ["Croissance", "150 €/mois · sans engagement", "Suivez vos chiffres", ["Tickets illimités", "CA comparé jour par jour, prévisions", "On répond à vos avis Google"], "Pub : 15 % de frais"],
  ["Pro", "500 €/mois · 3 mois minimum", "On s'en occupe", ["Tout Croissance", "Fiche Google tenue à jour", "Un rapport et un point chaque mois"], "Pub : 5 % de frais"],
];

const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Boosteats — page à laisser au comptoir</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Archivo:wght@400;500;600;700&display=block" rel="stylesheet">
<style>
@page { size: A4; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
:root { --night:#0C1509; --olive:#6B7C3F; --olive-dark:#4F5C2D; --light:#A9BB6E; --cream:#EFF1E4; --moss:#A2C523; --ink:#0A0A0A; --muted:#55554F; --line:#E2E2DC; --good:#467F3B; }
html, body { width: 210mm; height: 297mm; }
body { font-family: Archivo, system-ui, sans-serif; color: var(--ink); background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 210mm; height: 297mm; display: flex; flex-direction: column; overflow: hidden; }
.top { background: var(--night); color: #fff; padding: 13mm 14mm 11mm; position: relative; }
.top::after { content:""; position:absolute; right:-30mm; top:-30mm; width:95mm; height:95mm; border-radius:50%; background: radial-gradient(circle, rgba(162,197,35,.35), rgba(162,197,35,0) 70%); }
.logo svg { height: 10mm; width: auto; }
.logo svg text, .logo svg path[fill="#0C1509"] { }
h1 { font-family: "Space Grotesk", sans-serif; font-weight: 700; font-size: 31pt; line-height: 1.04; letter-spacing: -0.03em; margin-top: 9mm; max-width: 165mm; }
h1 em { font-style: normal; color: var(--moss); }
.sub { margin-top: 4mm; font-size: 13pt; color: #D9DECB; font-weight: 500; }
.sub b { color: #fff; }
.body { padding: 9mm 14mm 0; flex: 1; display: flex; flex-direction: column; gap: 7mm; }
.pillars { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; }
.pillar { border: 0.3mm solid var(--line); border-radius: 4mm; padding: 4.5mm; background: #FAFAF7; }
.pillar .n { display:inline-grid; place-items:center; width:7mm; height:7mm; border-radius:50%; background: var(--moss); color: var(--night); font-weight:700; font-size:10pt; }
.pillar h2 { font-family: "Space Grotesk", sans-serif; font-size: 14pt; margin-top: 2.5mm; letter-spacing: -0.01em; }
.pillar p { font-size: 9.4pt; line-height: 1.5; color: var(--muted); margin-top: 1.5mm; }
.gifts { display: grid; grid-template-columns: auto 1fr; gap: 5mm; align-items: center; background: var(--cream); border-radius: 4mm; padding: 4.5mm 5mm; }
.calc { font-family: "Space Grotesk", sans-serif; font-weight: 700; font-size: 15pt; white-space: nowrap; color: var(--olive-dark); }
.calc span { display:inline-block; background:#fff; border-radius: 2.5mm; padding: 1.2mm 2.5mm; color: var(--night); }
.gifts p { font-size: 9.6pt; line-height: 1.5; }
.gifts p b { font-size: 10.5pt; }
.plans { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; }
.plan { border: 0.3mm solid var(--line); border-radius: 4mm; padding: 4.5mm; display:flex; flex-direction:column; }
.plan.free { border: 0.6mm solid var(--moss); background: #F6FAE8; }
.plan .tag { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--olive-dark); }
.plan h3 { font-family: "Space Grotesk", sans-serif; font-size: 15pt; margin-top: 1mm; }
.plan .price { font-size: 9.5pt; font-weight: 600; margin-top: .5mm; }
.plan ul { list-style: none; margin-top: 2.5mm; display:flex; flex-direction:column; gap: 1.3mm; flex:1; }
.plan li { font-size: 9pt; line-height: 1.35; padding-left: 4mm; position: relative; color: var(--ink); }
.plan li::before { content:"✓"; position:absolute; left:0; color: var(--good); font-weight:700; }
.plan .fee { margin-top: 2.5mm; font-size: 8.4pt; color: var(--muted); border-top: 0.3mm dashed var(--line); padding-top: 2mm; }
.ht { font-size: 8pt; color: var(--muted); margin-top: -4.5mm; }
.cta { margin-top: auto; background: var(--night); color: #fff; padding: 8mm 14mm; display: grid; grid-template-columns: 1fr auto; gap: 8mm; align-items: center; }
.cta h4 { font-family: "Space Grotesk", sans-serif; font-size: 19pt; line-height: 1.1; letter-spacing: -0.02em; }
.cta h4 em { font-style: normal; color: var(--moss); }
.cta p { font-size: 10pt; color: #C9CEBB; margin-top: 2.5mm; line-height: 1.5; }
.contact { display:flex; gap: 6mm; margin-top: 4mm; font-size: 11pt; font-weight: 700; }
.contact span small { display:block; font-size: 7.5pt; font-weight: 500; color: var(--light); text-transform: uppercase; letter-spacing: .08em; }
.qr { background:#fff; border-radius: 3mm; padding: 3mm; width: 36mm; text-align:center; }
.qr svg { width: 30mm; height: 30mm; display:block; }
.qr small { display:block; color: var(--night); font-size: 7.2pt; font-weight: 700; margin-top: 1.5mm; }
</style></head>
<body><div class="page">
  <div class="top">
    <div class="logo">${logo.replace(/<title>.*?<\/title>/, "")}</div>
    <h1>Faites revenir vos clients.<br><em>Faites-en venir de nouveaux.</em></h1>
    <p class="sub"><b>Rien à brancher : le ticket de caisse suffit.</b> Votre caisse ne change pas.</p>
  </div>
  <div class="body">
    <div class="pillars">${pillars.map(([t, p], i) => `<div class="pillar"><span class="n">${i + 1}</span><h2>${t}</h2><p>${p}</p></div>`).join("")}</div>
    <div class="gifts">
      <div class="calc"><span>0,60 €</span> ÷ 8 % = <span>7,50 €</span></div>
      <p><b>Chaque cadeau est calculé sur ce qu'il vous coûte, au taux que vous choisissez (4 à 12 %).</b><br>À 8 %, une boisson qui vous coûte 0,60 € se gagne après 7,50 € d'achats chez vous.</p>
    </div>
    <div class="plans">${plans.map(([name, price, tag, items, fee], i) => `<div class="plan${i === 0 ? " free" : ""}"><p class="tag">${tag}</p><h3>${name}</h3><p class="price">${price}</p><ul>${items.map((x) => `<li>${x}</li>`).join("")}</ul><p class="fee">${fee}</p></div>`).join("")}</div>
    <p class="ht">Prix HTVA, par établissement. On commence toujours par le forfait gratuit.</p>
  </div>
  <div class="cta">
    <div>
      <h4>Analysez votre restaurant<br><em>gratuitement, en une minute.</em></h4>
      <p>Votre fiche Google, vos avis, vos voisins sur Google Maps : une note sur 100, puis le rapport complet et vos 5 priorités sur WhatsApp.</p>
      <div class="contact"><span><small>En ligne</small>boosteats.be/audit-gratuit</span><span><small>WhatsApp</small>${WHATSAPP}</span></div>
    </div>
    <div class="qr">${qr}<small>Scannez pour l'analyse</small></div>
  </div>
</div></body></html>`;

writeFileSync(out, html);
console.log("ok", out);
