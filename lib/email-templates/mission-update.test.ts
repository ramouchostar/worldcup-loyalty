import { test } from "node:test";
import assert from "node:assert/strict";
import { missionUpdateEmail, type MissionUpdateInput, type MissionUpdateKind } from "./mission-update";

const base: Omit<MissionUpdateInput, "kind" | "audience"> = { restaurantName: "Burger Palace", providerName: "Studio Croustille", url: "https://www.boosteats.be/x/m1" };
const mail = (kind: MissionUpdateKind, audience: MissionUpdateInput["audience"]) => missionUpdateEmail({ ...base, kind, audience });
const ALL = [["report_submitted", "restaurant"], ["delivered", "restaurant"], ["validated", "provider"], ["report_contested", "platform"], ["retouch_requested", "provider"], ["validation_reminder", "restaurant"], ["auto_validated", "restaurant"], ["auto_validated", "provider"]] as const;

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

test("retouche demandée : tous les tours en un envoi, une retouche n'est pas une refonte, dernier tour dit", () => {
  const m = missionUpdateEmail({ ...base, kind: "retouch_requested", audience: "provider", round: 2 });
  assert.match(m.subject, /tour 2 sur 2/);
  assert.match(m.text, /un seul envoi/);
  assert.match(m.text, /pas une refonte/);
  assert.match(m.text, /dernier tour/);
  assert.match(missionUpdateEmail({ ...base, kind: "retouch_requested", audience: "provider", round: 1 }).text, /Il reste un tour/);
});

test("les rappels de validation : le premier rassure, le second annonce la validation dans 2 jours", () => {
  const a = missionUpdateEmail({ ...base, kind: "validation_reminder", audience: "restaurant", round: 1 });
  const b = missionUpdateEmail({ ...base, kind: "validation_reminder", audience: "restaurant", round: 2 });
  assert.match(a.text, /7 jours/);
  assert.match(b.subject, /validation automatique/);
  assert.match(b.text, /dans 2 jours/);
  assert.match(b.text, /compte-rendu de tournage contesté bloque/);
});

test("la validation automatique parle à chacun avec ses mots", () => {
  assert.match(missionUpdateEmail({ ...base, kind: "auto_validated", audience: "provider" }).text, /prépare ton versement/);
  assert.match(missionUpdateEmail({ ...base, kind: "auto_validated", audience: "restaurant" }).text, /Tu n'as pas répondu/);
});

const cancelled = (audience: MissionUpdateInput["audience"], cancelledBy: "restaurant" | "provider" | "platform", band: "free" | "half" | "full") =>
  missionUpdateEmail({ ...base, kind: "cancelled", audience, cancelledBy, band });

test("annulation : chacun lit ce qui le concerne, avec ses mots", () => {
  assert.match(cancelled("provider", "restaurant", "half").text, /La moitié du tournage t'est due/);
  assert.match(cancelled("provider", "restaurant", "full").text, /Tout le tournage t'est dû/);
  assert.match(cancelled("provider", "restaurant", "free").text, /Aucun frais/);
  assert.match(cancelled("restaurant", "provider", "full").text, /remboursé en entier/);
  assert.match(cancelled("restaurant", "provider", "full").text, /nouveau brief/);
  assert.match(cancelled("restaurant", "restaurant", "half").text, /La moitié du tournage est due/);
  assert.match(cancelled("platform", "provider", "half").text, /à la main/);
});

test("la sanction est dite au prestataire qui annule tard, pas au prestataire qui annule à temps", () => {
  assert.match(cancelled("provider", "provider", "full").text, /sanctionnée/);
  assert.doesNotMatch(cancelled("provider", "provider", "free").text, /sanctionnée/);
});

test("le restaurateur ne lit jamais la sanction du prestataire", () => {
  assert.doesNotMatch(cancelled("restaurant", "provider", "full").text, /sanction|avertissement|exclusion/);
});

test("aucun euro dans un e-mail d'annulation", () => {
  for (const a of ["restaurant", "provider", "platform"] as const) for (const b of ["free", "half", "full"] as const) assert.doesNotMatch(cancelled(a, "provider", b).html + cancelled(a, "restaurant", b).text, /€/);
});
