import { test } from "node:test";
import assert from "node:assert/strict";
import { previewEntries } from "./fixtures";

// Les règles du produit, vérifiées sur le rendu réel de chaque gabarit :
// un e-mail membre est une surface client (ADR 0007/0028, CONTEXT.md).

const entries = previewEntries({ logoUrl: null, image: () => null });

function visibleText(html: string): string {
  return html
    .replace(/<head>[\s\S]*?<\/head>/, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

for (const e of entries.filter((x) => x.audience === "membre")) {
  const all = [e.email.subject, e.email.preheader, e.email.text, visibleText(e.email.html), e.short?.body ?? ""].join("\n");

  test(`${e.id} : aucun euro sauf la commande minimum de retrait (10 €)`, () => {
    assert.ok(!/€|\bEUR\b|euro/i.test(all.replace(/10 €/g, "")), all.match(/.{0,40}(€|EUR|euro).{0,20}/i)?.[0]);
  });

  test(`${e.id} : jamais « scanner » pour le ticket, jamais « automatique » ni « instantané »`, () => {
    assert.ok(!/scann/i.test(all));
    assert.ok(!/automatique|instantan/i.test(all));
  });
}

for (const e of entries) {
  test(`${e.id} : sujet, texte d'aperçu et version texte présents`, () => {
    assert.ok(e.email.subject.length > 5 && e.email.subject.length <= 90, e.email.subject);
    assert.ok(e.email.preheader.length > 5);
    assert.ok(e.email.text.length > 40);
    assert.ok(e.email.html.includes('<html lang="fr">'));
  });
}
