import { test } from "node:test";
import assert from "node:assert/strict";
import { cidFromFeatureId, isAllowedMapsUrl, parseMapsUrl, resolveMapsLink } from "./maps-link";

test("identifiant de fiche → CID décimal", () => {
  assert.equal(cidFromFeatureId("0x47c3dd20ef3fd815:0xdfe9727ecf5ecd1"), "1008409564312628433");
  assert.equal(cidFromFeatureId("rien"), null);
});

test("lien /maps/place avec data=!1s… : CID et nom", () => {
  const t = parseMapsUrl("https://www.google.com/maps/place/Belchicken+Kraainem/@50.85,4.46,17z/data=!4m6!3m5!1s0x47c3dd20ef3fd815:0xdfe9727ecf5ecd1!8m2");
  assert.deepEqual(t, { cid: "1008409564312628433", name: "Belchicken Kraainem" });
});

test("lien ?cid= et page de consentement", () => {
  assert.equal(parseMapsUrl("https://maps.google.com/?cid=123456")?.cid, "123456");
  const c = parseMapsUrl("https://consent.google.com/ml?continue=https://www.google.com/maps?cid%3D987&gl=BE");
  assert.equal(c?.cid, "987");
});

test("lien de recherche share.google : le nom seul", () => {
  const t = parseMapsUrl("https://www.google.com/search?kgmid=/g/11rq79crjp&q=Krusty+Smash+Burgers&shndl=30");
  assert.deepEqual(t, { cid: null, name: "Krusty Smash Burgers" });
});

test("garde anti-SSRF : seuls les hôtes Google sont suivis", () => {
  assert.ok(isAllowedMapsUrl("https://maps.app.goo.gl/abc"));
  assert.ok(isAllowedMapsUrl("https://share.google/abc"));
  assert.ok(!isAllowedMapsUrl("https://evil.example/maps/place/x"));
  assert.ok(!isAllowedMapsUrl("http://www.google.com/maps"));
  assert.ok(!isAllowedMapsUrl("https://google.com.evil.io/"));
});

test("résolution : suit share.google jusqu'au nom, s'arrête avant le consentement", async () => {
  const chain: Record<string, string> = {
    "https://share.google/717": "https://www.google.com/share.google?q=717",
    "https://www.google.com/share.google?q=717": "https://www.google.com/search?kgmid=/g/1&q=Krusty+Smash+Burgers",
    "https://www.google.com/search?kgmid=/g/1&q=Krusty+Smash+Burgers": "https://consent.google.com/ml?continue=x",
  };
  const fake = (async (u: string) => new Response(null, { status: chain[u] ? 302 : 200, headers: chain[u] ? { location: chain[u] } : {} })) as typeof fetch;
  const r = await resolveMapsLink("https://share.google/717", fake);
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.target, { cid: null, name: "Krusty Smash Burgers" });
});

test("résolution : refuse une redirection hors Google", async () => {
  const fake = (async () => new Response(null, { status: 302, headers: { location: "https://evil.example/" } })) as typeof fetch;
  const r = await resolveMapsLink("https://maps.app.goo.gl/x", fake);
  assert.equal(r.ok, false);
});
