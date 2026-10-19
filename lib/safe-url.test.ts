import { test } from "node:test";
import assert from "node:assert/strict";
import { URL_ISSUE_TEXT, isBlockedHostname, isPrivateAddress, judgeUrl } from "./safe-url";
import { QR_REASON_TEXT, checkQrUrl } from "./qr-check";

const reason = (raw: string) => {
  const r = judgeUrl(raw);
  return r.ok ? "ok" : r.issue;
};

test("une adresse de QR code : https, un vrai nom de site, sans identifiants", () => {
  assert.equal(reason("https://monrestaurant.be/menu"), "ok");
  assert.equal(reason("  https://www.monrestaurant.be/menu?table=4#haut  "), "ok");
  assert.equal(reason(""), "empty");
  assert.equal(reason("   "), "empty");
  assert.equal(reason("monrestaurant.be"), "invalid");
  assert.equal(reason("http://monrestaurant.be"), "not_https");
  assert.equal(reason("javascript:alert(1)"), "not_https");
  assert.equal(reason("data:text/html,<b>x</b>"), "not_https");
  assert.equal(reason("ftp://monrestaurant.be"), "not_https");
  assert.equal(reason("https://moi:secret@monrestaurant.be"), "credentials");
  assert.equal(reason("https://intranet/menu"), "no_dot");
  assert.equal(reason("https://" + "a".repeat(600) + ".be"), "too_long");
});

test("jamais une adresse en chiffres, même publique, ni un nom de machine interne", () => {
  for (const h of ["https://203.0.113.9/x", "https://127.0.0.1/", "https://10.0.0.5/", "https://169.254.169.254/latest/meta-data/", "https://[::1]/", "https://[2001:db8::1]/", "https://2130706433/", "https://0x7f000001/", "https://0177.0.0.1/"]) assert.equal(reason(h), "ip_literal", h);
  for (const h of ["https://localhost.localdomain.local/", "https://api.internal/", "https://db.lan/", "https://monsite.localhost/", "https://metadata.google.internal/"]) assert.equal(reason(h), "blocked_host", h);
  assert.equal(isBlockedHostname("LOCALHOST"), true);
  assert.equal(isBlockedHostname("localhost."), true);
  assert.equal(isBlockedHostname("monrestaurant.be"), false);
});

test("les adresses résolues privées, locales ou réservées sont refusées (v4, v6, et v4 cachée en v6)", () => {
  for (const a of ["127.0.0.1", "127.8.9.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "192.0.2.5", "198.18.0.1", "203.0.113.7", "::1", "::", "fe80::1", "fd12:3456::1", "fc00::1", "ff02::1", "2001:db8::1", "64:ff9b::7f00:1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "pas une adresse", "300.1.1.1"]) assert.equal(isPrivateAddress(a), true, a);
  for (const a of ["93.184.216.34", "8.8.8.8", "172.15.0.1", "172.32.0.1", "11.0.0.1", "192.169.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) assert.equal(isPrivateAddress(a), false, a);
});

test("chaque motif a sa phrase, pour l'adresse et pour le test", () => {
  for (const t of Object.values(URL_ISSUE_TEXT)) assert.ok(t.length > 15, t);
  for (const t of Object.values(QR_REASON_TEXT)) assert.ok(t.length > 15, t);
});

// ── le test du scan, sans réseau : la requête et la résolution sont injectées ──
const resp = (status: number, headers: Record<string, string> = {}) => new Response(null, { status, headers });
const web = (routes: Record<string, Response | (() => Response)>) => {
  const calls: string[] = [];
  const impl = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const r = routes[url];
    if (!r) throw new Error("injoignable");
    return typeof r === "function" ? r() : r;
  }) as typeof fetch;
  return { impl, calls };
};
const publicDns = async () => true;

test("un site qui répond 200 : le scan est bon, on dit où il mène", async () => {
  const { impl, calls } = web({ "https://www.monrestaurant.be/menu": resp(200) });
  const r = await checkQrUrl("https://www.monrestaurant.be/menu", { fetch: impl, resolvesPublic: publicDns });
  assert.deepEqual(r, { ok: true, finalHost: "monrestaurant.be", redirected: false, status: 200 });
  assert.equal(calls.length, 1);
});

test("une redirection est suivie à la main, trois au plus, chaque saut re-jugé", async () => {
  const { impl } = web({
    "https://bit.example.be/a": resp(302, { location: "https://monrestaurant.be/b" }),
    "https://monrestaurant.be/b": resp(301, { location: "/menu" }),
    "https://monrestaurant.be/menu": resp(200),
  });
  const r = await checkQrUrl("https://bit.example.be/a", { fetch: impl, resolvesPublic: publicDns });
  assert.deepEqual(r, { ok: true, finalHost: "monrestaurant.be", redirected: true, status: 200 });

  const loop = web({ "https://a.example.be/": resp(302, { location: "https://a.example.be/" }) });
  assert.deepEqual(await checkQrUrl("https://a.example.be/", { fetch: loop.impl, resolvesPublic: publicDns }), { ok: false, reason: "too_many_redirects" });
  assert.equal(loop.calls.length, 4); // l'adresse + trois sauts, pas un de plus
});

test("une redirection vers le réseau interne, une adresse en chiffres ou du http est REFUSÉE", async () => {
  for (const [location, expected] of [
    ["https://169.254.169.254/latest/meta-data/", "ip_literal"],
    ["https://127.0.0.1/admin", "ip_literal"],
    ["http://monrestaurant.be/menu", "not_https"],
    ["https://service.internal/", "blocked_host"],
    ["javascript:alert(1)", "not_https"],
  ] as const) {
    const { impl, calls } = web({ "https://site.example.be/": resp(302, { location }) });
    assert.deepEqual(await checkQrUrl("https://site.example.be/", { fetch: impl, resolvesPublic: publicDns }), { ok: false, reason: expected }, location);
    assert.equal(calls.length, 1, "la cible n'est jamais cherchée");
  }
});

test("un nom qui se résout vers une adresse privée n'est jamais cherché", async () => {
  const { impl, calls } = web({ "https://evil.example.be/": resp(200) });
  const r = await checkQrUrl("https://evil.example.be/", { fetch: impl, resolvesPublic: async () => false });
  assert.deepEqual(r, { ok: false, reason: "private_address" });
  assert.equal(calls.length, 0);
});

test("les codes de réponse : 404 et 500 sont des erreurs ; 401, 403 et 429 disent que le site existe", async () => {
  const code = async (status: number) => (await checkQrUrl("https://monrestaurant.be/", { fetch: web({ "https://monrestaurant.be/": resp(status) }).impl, resolvesPublic: publicDns })).ok;
  assert.equal(await code(200), true);
  assert.equal(await code(204), true);
  assert.equal(await code(403), true);
  assert.equal(await code(401), true);
  assert.equal(await code(429), true);
  assert.equal(await code(404), false);
  assert.equal(await code(410), false);
  assert.equal(await code(500), false);
  const bad = await checkQrUrl("https://monrestaurant.be/", { fetch: web({ "https://monrestaurant.be/": resp(404) }).impl, resolvesPublic: publicDns });
  assert.deepEqual(bad, { ok: false, reason: "bad_status", status: 404 });
});

test("un site qui ne répond pas, ou une redirection sans destination, est dit sans fuir d'erreur", async () => {
  assert.deepEqual(await checkQrUrl("https://muet.example.be/", { fetch: web({}).impl, resolvesPublic: publicDns }), { ok: false, reason: "unreachable" });
  const noLocation = web({ "https://x.example.be/": resp(302) });
  assert.deepEqual(await checkQrUrl("https://x.example.be/", { fetch: noLocation.impl, resolvesPublic: publicDns }), { ok: false, reason: "bad_status", status: 302 });
  assert.deepEqual(await checkQrUrl("pas une adresse", { fetch: web({}).impl, resolvesPublic: publicDns }), { ok: false, reason: "invalid" });
});
