import { test } from "node:test";
import assert from "node:assert/strict";
import { initialOf, toDetails } from "./places";

test("auteur d'avis : l'initiale seulement, jamais le nom (ADR 0025)", () => {
  assert.equal(initialOf("karim B."), "K");
  assert.equal(initialOf("  élodie"), "É");
  assert.equal(initialOf(""), "·");
  assert.equal(initialOf(null), "·");
  assert.equal(initialOf("123"), "·");
});

test("fiche Places → forme interne : code postal, services, avis sans nom", () => {
  const d = toDetails({
    id: "ChIJabc1234567",
    displayName: { text: "Belchicken Uccle" },
    formattedAddress: "Chaussée d'Alsemberg 812, 1180 Uccle, Belgique",
    addressComponents: [{ longText: "1180", types: ["postal_code"] }],
    location: { latitude: 50.79, longitude: 4.33 },
    rating: 4.1,
    userRatingCount: 312,
    primaryTypeDisplayName: { text: "Restaurant de poulet frit" },
    regularOpeningHours: { openNow: true, weekdayDescriptions: ["lundi: 11:00–23:00"] },
    photos: [{ name: "places/ChIJabc1234567/photos/AbC" }],
    reviews: [{ rating: 1, text: { text: "Trop d'attente" }, relativePublishTimeDescription: "il y a 1 mois", authorAttribution: { displayName: "Karim Benali" } }],
    takeout: true,
  });
  assert.equal(d.postalCode, "1180");
  assert.equal(d.address, "Chaussée d'Alsemberg 812, 1180 Uccle");
  assert.equal(d.hasHours, true);
  assert.equal(d.openNow, true);
  assert.deepEqual(d.services, { dineIn: null, takeout: true, delivery: null });
  assert.equal(d.reviews[0].initial, "K");
  assert.ok(!JSON.stringify(d).includes("Benali"));
});
