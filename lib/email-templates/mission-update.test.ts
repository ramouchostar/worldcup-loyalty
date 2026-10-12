import { test } from "node:test";
import assert from "node:assert/strict";
import { missionUpdateEmail, type MissionUpdateInput, type MissionUpdateKind } from "./mission-update";

const base: Omit<MissionUpdateInput, "kind" | "audience"> = { restaurantName: "Burger Palace", providerName: "Studio Croustille", url: "https://www.boosteats.be/x/m1" };
const mail = (kind: MissionUpdateKind, audience: MissionUpdateInput["audience"]) => missionUpdateEmail({ ...base, kind, audience });
const ALL = [["report_submitted", "restaurant"], ["delivered", "restaurant"], ["validated", "provider"], ["report_contested", "platform"]] as const;

test("chaque mise à jour a un sujet, le lien et ce qu'on attend", () => {
  for (const [kind, audience] of ALL) {
    const m = mail(kind, audience);
    assert.ok(m.html.includes(base.url), kind);
    assert.ok(m.subject.length > 10, kind);
    assert.ok(m.text.includes(base.url), kind);
  }
});

test("la livraison rappelle les deux tours de retours en une fois et la validation automatique", () => {
  const m = mail("delivered", "restaurant");
  assert.match(m.text, /deux tours de retours/);
  assert.match(m.text, /une seule fois/);
  assert.match(m.text, /7 jours/);
});

test("un compte-rendu contesté bloque toute validation automatique", () => {
  assert.match(mail("report_contested", "platform").text, /Aucune validation ni aucun versement n'est automatique/);
});

test("jamais un montant, jamais le contenu du compte-rendu", () => {
  for (const [kind, audience] of ALL) {
    const m = mail(kind, audience);
    assert.doesNotMatch(m.html + m.text, /€|\d{2}:\d{2}/, kind);
  }
});

test("un nom venu de la base est échappé", () => {
  const m = missionUpdateEmail({ ...base, restaurantName: "<script>x</script>", providerName: "<b>Y</b>", kind: "delivered", audience: "restaurant" });
  assert.ok(!m.html.includes("<script>x</script>"));
  assert.ok(!m.html.includes("<b>Y</b>"));
});
