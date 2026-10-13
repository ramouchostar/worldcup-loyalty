import { test } from "node:test";
import assert from "node:assert/strict";
import { missionReminderEmail, type MissionReminderInput } from "./mission-reminder";

const base: MissionReminderInput = {
  key: "j2",
  audience: "restaurant",
  recipientName: "Karim",
  otherName: "Studio Croustille",
  restaurantName: "Burger Palace",
  dateLabel: "mardi 27 octobre",
  startTime: "09:30",
  contact: "Karim · 0470 12 34 56",
  url: "https://www.boosteats.be/admin/x/prestataires/m1",
};
const mail = (over: Partial<MissionReminderInput>) => missionReminderEmail({ ...base, ...over });

test("chaque rappel dit quand, le lien et ce qu'on attend", () => {
  for (const key of ["j7", "j2", "veille"] as const) {
    for (const audience of ["restaurant", "provider"] as const) {
      if (key === "j7" && audience === "provider") continue; // le j7 ne concerne que le restaurateur
      const m = mail({ key, audience });
      assert.ok(m.html.includes(base.url), `${key} ${audience}`);
      assert.match(m.text, /27 octobre/);
      assert.match(m.text, /09:30/);
      assert.ok(m.subject.length > 10);
    }
  }
});

test("J-7 : l'équipe, les étudiants, une seule fois", () => {
  const m = mail({ key: "j7" });
  assert.match(m.text, /étudiants/);
  assert.match(m.text, /Prévenir mon équipe/);
  assert.match(m.subject, /Préviens ton équipe/);
});

test("J-2 : la règle des 48 h côté restaurateur, le manquement côté prestataire", () => {
  assert.match(mail({ key: "j2" }).text, /moins de 48 h est dû en entier/);
  assert.match(mail({ key: "j2", audience: "provider" }).text, /remboursée au restaurateur/);
});

test("la veille : celui qui n'a pas confirmé est invité à le faire, celui qui a confirmé voit l'état de l'autre", () => {
  assert.match(mail({ key: "veille", selfConfirmed: false }).text, /Confirmer ma présence/);
  const both = mail({ key: "veille", selfConfirmed: true, otherConfirmed: true });
  assert.match(both.text, /tous les deux confirmé/);
  assert.match(both.text, /Voir la mission/);
  assert.match(mail({ key: "veille", selfConfirmed: true, otherConfirmed: false }).text, /n'a pas encore confirmé/);
  assert.match(mail({ key: "veille", audience: "provider", selfConfirmed: true, otherConfirmed: false }).text, /On le relance|on le relance/);
});

test("l'alerte plateforme dit qui manque", () => {
  const m = mail({ key: "alerte", audience: "platform", missing: ["Studio Croustille"] });
  assert.match(m.subject, /Présence non confirmée/);
  assert.match(m.text, /Studio Croustille/);
  assert.match(m.html, /plateforme Boosteats/);
});

test("pas d'euro dans un rappel, et un nom venu de la base est échappé", () => {
  for (const key of ["j7", "j2", "veille"] as const) assert.doesNotMatch(mail({ key }).html + mail({ key }).text, /€/);
  const m = mail({ restaurantName: "<script>x</script>", otherName: "<b>Y</b>" });
  assert.ok(!m.html.includes("<script>x</script>"));
  assert.ok(!m.html.includes("<b>Y</b>"));
});
