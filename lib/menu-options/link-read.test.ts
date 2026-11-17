import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchMenuPage, htmlToText, isPlatformHost, menuLinks, normalizeLink } from "./link-read";
import { PdfReadError } from "./pdf-read";

const html = (body: string, headers: Record<string, string> = { "content-type": "text/html; charset=utf-8" }, status = 200) => new Response(body, { status, headers });
const LONG = `<html><head><title>x</title><script>var a=1</script></head><body><h1>Notre carte</h1>${"<p>Burger maison pain brioché cheddar oignons 9,50 €</p>".repeat(12)}</body></html>`;

const publicDeps = (responses: Response[]) => {
  const urls: string[] = [];
  return { urls, deps: { resolvesPublic: async () => true, fetch: (async (u: string) => { urls.push(u); return responses.shift()!; }) as unknown as typeof fetch } };
};

const refuses = async (p: Promise<unknown>, part: RegExp, status?: number) => {
  await assert.rejects(p, (e: unknown) => e instanceof PdfReadError && part.test(e.message) && (status === undefined || e.status === status));
};

test("htmlToText : sans script ni style, un saut de ligne entre les blocs, entités décodées", () => {
  const t = htmlToText("<html><head><style>p{}</style></head><body><script>alert(1)</script><h2>Burgers</h2><ul><li>Cheese&nbsp;burger 9&euro;50</li><li>Caf&#233;</li></ul>un<br>deux</body></html>");
  assert.equal(t, "Burgers\nCheese burger 9€50\nCafé\nun\ndeux");
  assert.ok(!t.includes("alert"));
});

test("htmlToText : les données structurées (menu schema.org) sont gardées", () => {
  const t = htmlToText(`<body><p>Carte</p><script type="application/ld+json">{"@type":"Menu","name":"Kebab poulet"}</script></body>`);
  assert.match(t, /Kebab poulet/);
});

test("normalizeLink : l'adresse écrite sans https:// est acceptée, rien d'autre n'est deviné", () => {
  assert.equal(normalizeLink(" monsite.be/menu "), "https://monsite.be/menu");
  assert.equal(normalizeLink("https://monsite.be"), "https://monsite.be");
  assert.equal(normalizeLink("ftp://x.be"), "ftp://x.be");
  assert.equal(normalizeLink("  "), "");
});

test("isPlatformHost : les plateformes de livraison sont reconnues, un site de restaurant non", () => {
  for (const h of ["www.ubereats.com", "deliveroo.be", "www.takeaway.com", "just-eat.be", "restaurant.wolt.com"]) assert.equal(isPlatformHost(h), true, h);
  for (const h of ["monrestaurant.be", "www.chez-ubert.be", "menu.tablebooker.com"]) assert.equal(isPlatformHost(h), false, h);
});

test("une page lisible : son texte est rendu", async () => {
  const { deps, urls } = publicDeps([html(LONG)]);
  const src = await fetchMenuPage("monsite.be/menu", deps);
  assert.equal(src.kind, "page");
  assert.match((src as { text: string }).text, /Burger maison/);
  assert.deepEqual(urls, ["https://monsite.be/menu"]);
});

test("un lien vers un PDF rend le PDF", async () => {
  const { deps } = publicDeps([html("%PDF-1.7 ...", { "content-type": "application/pdf" })]);
  const src = await fetchMenuPage("https://monsite.be/carte.pdf", deps);
  assert.equal(src.kind, "pdf");
});

test("les liens des plateformes de livraison ne sont pas lus : on le dit, on n'essaie pas", async () => {
  const { deps, urls } = publicDeps([]);
  await refuses(fetchMenuPage("https://www.ubereats.com/be/store/houba/abc", deps), /plateformes de livraison/);
  assert.equal(urls.length, 0);
});

test("une adresse qui se résout vers le réseau interne est refusée AVANT toute requête", async () => {
  let called = false;
  await refuses(fetchMenuPage("https://monsite.be", { resolvesPublic: async () => false, fetch: (async () => { called = true; return html(LONG); }) as unknown as typeof fetch }), /pas celle d'un site public/, 400);
  assert.equal(called, false);
});

test("adresses refusées d'avance : http, adresse en chiffres, localhost, identifiants", async () => {
  const { deps } = publicDeps([]);
  for (const bad of ["http://monsite.be", "https://127.0.0.1/menu", "https://localhost/menu", "https://user:pw@monsite.be", "https://169.254.169.254/latest", ""]) {
    await assert.rejects(fetchMenuPage(bad, deps), PdfReadError, bad);
  }
});

test("une redirection vers une adresse interne est refusée au saut, pas suivie", async () => {
  const { deps, urls } = publicDeps([html("", { location: "https://127.0.0.1/admin" }, 302)]);
  await assert.rejects(fetchMenuPage("https://monsite.be", deps), PdfReadError);
  assert.equal(urls.length, 1);
});

test("une redirection vers un site public est suivie, mais 3 au plus", async () => {
  const hop = (to: string) => html("", { location: to }, 301);
  const ok = publicDeps([hop("https://www.monsite.be/menu"), html(LONG)]);
  assert.equal((await fetchMenuPage("https://monsite.be", ok.deps)).kind, "page");
  assert.deepEqual(ok.urls, ["https://monsite.be/", "https://www.monsite.be/menu"]);
  const loop = publicDeps([hop("https://a.be/1"), hop("https://a.be/2"), hop("https://a.be/3"), hop("https://a.be/4"), hop("https://a.be/5")]);
  await refuses(fetchMenuPage("https://monsite.be", loop.deps), /trop de fois/);
});

test("un site qui refuse les robots, une page d'erreur, une page presque vide : chaque cas dit quoi faire", async () => {
  await refuses(fetchMenuPage("https://monsite.be", publicDeps([html("no", undefined, 403)]).deps), /refuse la lecture automatique/);
  await refuses(fetchMenuPage("https://monsite.be", publicDeps([html("no", undefined, 404)]).deps), /page d'erreur/);
  await refuses(fetchMenuPage("https://monsite.be", publicDeps([html("<html><body><div id=root></div></body></html>")]).deps), /JavaScript/);
});

test("un type de fichier qui n'est ni une page ni un PDF est refusé", async () => {
  await refuses(fetchMenuPage("https://monsite.be/x", publicDeps([html("GIF89a", { "content-type": "image/gif" })]).deps), /ne mène pas à une page de menu/);
});

test("une page géante n'est pas lue en entier", async () => {
  const big = html("a".repeat(3 * 1024 * 1024 + 10));
  await refuses(fetchMenuPage("https://monsite.be", publicDeps([big]).deps), /trop lourde/, 413);
});

test("un site qui ne répond pas", async () => {
  const deps = { resolvesPublic: async () => true, fetch: (async () => { throw new Error("ECONNRESET"); }) as unknown as typeof fetch };
  await refuses(fetchMenuPage("https://monsite.be", deps), /ne répond pas/, 502);
});

// ─── Un menu réparti sur plusieurs pages (Belchicken : un sommaire, une page par plat) ───────────────────────

const NAV = "<nav><a href='/fr/menu/'>Menu</a> Notre histoire Restaurants Franchise Contact</nav><footer>Conditions d'utilisation Politique de confidentialité</footer>";
const hubHtml = (links: string[]) => `<html><body>${NAV}<main>${links.map((l) => `<a href="${l}"><img alt="Plat ${l.split("/").filter(Boolean).pop()}" src="x.png"></a>`).join("")}</main></body></html>`;
const productHtml = (name: string) => `<html><body>${NAV}<h1>${name}</h1><p>Description de ${name}.</p><p>Allergènes</p><p>Gluten, Lait</p></body></html>`;

function site(pages: Record<string, string>) {
  const urls: string[] = [];
  return {
    urls,
    deps: {
      resolvesPublic: async () => true,
      fetch: (async (u: string) => {
        urls.push(u);
        const body = pages[u];
        return body === undefined ? new Response("no", { status: 404 }) : html(body);
      }) as unknown as typeof fetch,
    },
  };
}

test("htmlToText : le nom d'un plat qui n'est que dans le texte alternatif de sa photo est gardé", () => {
  assert.match(htmlToText(`<a href="/x"><img alt="Burger de bœuf extrême" src="a.png"></a>`), /Burger de bœuf extrême/);
});

test("htmlToText : un fil d'Ariane (schema.org) n'est pas gardé, un menu oui", () => {
  const t = htmlToText(`<body>x<script type="application/ld+json">{"@type":"BreadcrumbList","name":"fil"}</script><script type="application/ld+json">{"@type":"Menu","name":"Carte"}</script></body>`);
  assert.ok(!t.includes("fil") && t.includes("Carte"));
});

test("menuLinks : les pages du même site et de la même langue, jamais les pages légales, les fichiers ni les autres sites", () => {
  const base = new URL("https://belchicken.com/fr/menu/");
  const html = [
    "/fr/boeuf-extreme/", "https://belchicken.com/fr/pepites/", "https://www.belchicken.com/fr/frites/", "/fr/pepites/#haut",
    "/fr/contact/", "/fr/politique-de-confidentialite-et-de-cookies/", "/fr/restaurants/", "/de/speisekarte/", "/fr/menu/",
    "https://autre-site.be/fr/menu-x/", "http://order.belchicken.com", "/wp-content/x.jpg", "/fr/",
  ].map((h) => `<a href="${h}">x</a>`).join("");
  assert.deepEqual(menuLinks(html, base), ["https://belchicken.com/fr/boeuf-extreme/", "https://belchicken.com/fr/pepites/", "https://www.belchicken.com/fr/frites/"]);
});

test("un sommaire : les pages liées sont lues, sans répéter le menu de navigation ni le pied de page", async () => {
  const names = ["boeuf-extreme", "pepites", "frites", "wraps", "desserts", "salades"];
  const pages: Record<string, string> = { "https://belchicken.com/fr/menu/": hubHtml(names.map((n) => `/fr/${n}/`)) };
  for (const n of names) pages[`https://belchicken.com/fr/${n}/`] = productHtml(`Produit ${n}`);
  const s = site(pages);
  const src = await fetchMenuPage("https://belchicken.com/fr/menu/", s.deps);
  assert.equal(src.kind, "page");
  const text = (src as { text: string }).text;
  assert.equal(s.urls.length, 1 + names.length);
  for (const n of names) assert.match(text, new RegExp(`Produit ${n}`));
  assert.match(text, /Plat boeuf-extreme/); // le nom vu sur la photo du sommaire
  assert.equal((text.match(/Notre histoire/g) ?? []).length, 1); // la navigation n'apparaît qu'une fois
  assert.equal((text.match(/Allergènes/g) ?? []).length, names.length); // ce qui est propre à chaque page reste
  assert.match(text, /## Page « boeuf extreme »/);
});

test("un sommaire : une page liée qui échoue ne fait pas échouer les autres", async () => {
  const names = ["a1", "a2", "a3", "a4", "a5", "a6"];
  const pages: Record<string, string> = { "https://monsite.be/menu/": hubHtml(names.map((n) => `/menu/${n}/`)) };
  for (const n of names.slice(0, 4)) pages[`https://monsite.be/menu/${n}/`] = productHtml(`Plat ${n}`);
  const src = await fetchMenuPage("https://monsite.be/menu/", site(pages).deps); // a5 et a6 : 404
  assert.equal(src.kind, "page");
  assert.match((src as { text: string }).text, /Plat a4/);
});

test("une page qui montre déjà son menu n'est pas explorée plus loin", async () => {
  const long = `<html><body>${"<p>Burger maison pain brioché cheddar oignons 9,50 €</p>".repeat(150)}${Array.from({ length: 8 }, (_, i) => `<a href="/menu/p${i}/">x</a>`).join("")}</body></html>`;
  const s = site({ "https://monsite.be/menu/": long });
  await fetchMenuPage("https://monsite.be/menu/", s.deps);
  assert.equal(s.urls.length, 1);
});

test("les pages liées passent par les mêmes gardes : une adresse interne n'est jamais lue", async () => {
  const names = ["a1", "a2", "a3", "a4", "a5", "a6"];
  const pages: Record<string, string> = { "https://monsite.be/menu/": hubHtml(names.map((n) => `/menu/${n}/`)) + `<a href="https://127.0.0.1/menu/x/">x</a>` };
  const s = site(pages);
  await assert.rejects(fetchMenuPage("https://monsite.be/menu/", s.deps), PdfReadError); // aucune page liée n'a de texte : refus clair
  assert.ok(!s.urls.some((u) => u.includes("127.0.0.1")));
});
