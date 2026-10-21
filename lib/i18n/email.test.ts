import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LOCALES, type Locale } from "./index";
import { missionUpdateEmail, type MissionUpdateInput, type MissionUpdateKind } from "../email-templates/mission-update";
import { providerInviteEmail } from "../email-templates/provider-invite";
import { providerBriefReceivedEmail } from "../email-templates/provider-brief-received";
import { providerDateBookedEmail } from "../email-templates/provider-date-booked";
import { missionReminderEmail, type MissionReminderInput } from "../email-templates/mission-reminder";

// ADR 0084 §5 terdecies — les e-mails que reçoit le prestataire, dans sa langue.

const PROVIDER_KINDS: MissionUpdateKind[] = [
  "validated", "retouch_requested", "auto_validated", "studio_start", "studio_deliver", "studio_overdue", "bat_corrections_due", "message_received", "bat_corrections", "bat_signed",
  "cancelled", "dispute_opened", "dispute_resolved", "paid_out", "proposals_again", "proposal_chosen", "proposal_auto", "proposals_due", "change_requested", "change_accepted",
  "change_restaurant_declined", "change_withdrawn", "change_expired",
];

const base = { audience: "provider" as const, restaurantName: "Chez Nour", providerName: "Studio Croustille", url: "https://exemple.be/m/1" };
const unresolved = (s: string) => /\{\w+\}/.test(s);

function variants(kind: MissionUpdateKind): MissionUpdateInput[] {
  const common = { ...base, kind, title: "Le geste du chef", count: 3, deadlineDay: "2026-10-22", providerPct: 40 };
  if (kind === "cancelled") {
    const out: MissionUpdateInput[] = [];
    for (const cancelledBy of ["restaurant", "provider"] as const) for (const band of ["free", "half", "full", "deposit"] as const) for (const studio of [false, true]) out.push({ ...common, cancelledBy, band, studio });
    return out;
  }
  if (kind === "dispute_resolved") return (["pay", "refund", "split"] as const).map((decision) => ({ ...common, decision }));
  if (kind === "proposal_auto") return (["auto", "fallback"] as const).map((auto) => ({ ...common, auto }));
  if (kind === "retouch_requested") return ([1, 2] as const).map((round) => ({ ...common, round }));
  if (kind === "change_accepted") return [true, false].map((free) => ({ ...common, free }));
  return [common, { ...common, deadlineDay: undefined, title: undefined, count: undefined }];
}

test("chaque e-mail du prestataire est complet dans les trois langues : aucune variable oubliée, aucun champ vide", () => {
  for (const kind of PROVIDER_KINDS) {
    for (const input of variants(kind)) {
      for (const locale of LOCALES) {
        const m = missionUpdateEmail({ ...input, locale });
        for (const part of [m.subject, m.preheader, m.html, m.text]) {
          assert.ok(part.trim().length > 0, `${kind}/${locale} vide`);
          assert.ok(!unresolved(part), `${kind}/${locale} : variable oubliée dans « ${part.slice(0, 80)} »`);
        }
      }
    }
  }
});

test("le prestataire lit son e-mail dans sa langue, et le français reste celui d'avant", () => {
  const fr = missionUpdateEmail({ ...base, kind: "validated" });
  assert.equal(fr.subject, "Chez Nour a validé ta livraison");
  assert.equal(missionUpdateEmail({ ...base, kind: "validated", locale: "nl" }).subject, "Chez Nour heeft je levering goedgekeurd");
  assert.equal(missionUpdateEmail({ ...base, kind: "validated", locale: "en" }).subject, "Chez Nour approved your delivery");
  assert.notEqual(missionUpdateEmail({ ...base, kind: "validated", locale: "nl" }).html, fr.html);
});

test("l'alerte de la plateforme reste en français, quelle que soit la langue demandée", () => {
  const platform = missionUpdateEmail({ ...base, audience: "platform", kind: "bat_signed", locale: "en" });
  assert.match(platform.subject, /Bon à tirer signé/);
});

test("le jour limite est dit dans la langue du prestataire", () => {
  const nl = missionUpdateEmail({ ...base, kind: "studio_start", deadlineDay: "2026-10-22", locale: "nl" });
  assert.match(nl.preheader, /donderdag 22 oktober/);
  const en = missionUpdateEmail({ ...base, kind: "studio_start", deadlineDay: "2026-10-22", locale: "en" });
  assert.match(en.preheader, /Thursday 22 October/);
  const fr = missionUpdateEmail({ ...base, kind: "studio_start", deadlineDay: "2026-10-22" });
  assert.match(fr.preheader, /jeudi 22 octobre/);
  // Sans le jour ISO (anciens appelants) : le libellé français est repris tel quel.
  assert.match(missionUpdateEmail({ ...base, kind: "studio_start", deadlineLabel: "jeudi 22 octobre" }).preheader, /jeudi 22 octobre/);
});

test("invitation, nouveau brief, date réservée : complets dans les trois langues", () => {
  for (const locale of LOCALES as readonly Locale[]) {
    const invite = providerInviteEmail("Studio", "https://exemple.be/i/abc", "2026-11-04T10:00:00Z", "studio@exemple.be", locale);
    const brief = providerBriefReceivedEmail("Studio", "Chez Nour", "Carte et menu", "https://exemple.be/m/1", "photo", locale);
    const briefNoGoal = providerBriefReceivedEmail("Studio", "Chez Nour", null, "https://exemple.be/m/1", "impression", locale);
    const date = providerDateBookedEmail({ providerName: "Studio", restaurantName: "Chez Nour", dateLabel: "mardi 20 octobre", dateISO: "2026-10-20", startTime: "09:30", contact: "Karim · 0470 12 34 56", missionUrl: "https://exemple.be/m/1", locale });
    for (const m of [invite, brief, briefNoGoal, date]) {
      for (const part of [m.subject, m.preheader, m.html, m.text]) assert.ok(part.length > 0 && !unresolved(part), `${locale} : ${part.slice(0, 60)}`);
    }
    assert.match(invite.html, /studio@exemple\.be/);
    assert.match(invite.html, /https:\/\/exemple\.be\/i\/abc/);
    assert.match(brief.html, /Carte et menu/);
  }
  assert.match(providerInviteEmail("Studio", "https://x", "2026-11-04T10:00:00Z", "a@b.be", "nl").subject, /dienstverleners/);
  assert.match(providerInviteEmail("Studio", "https://x", "2026-11-04T10:00:00Z", "a@b.be").subject, /Ton espace prestataire/);
  assert.match(providerBriefReceivedEmail("S", "Chez Nour", null, "https://x", "design", "nl").html, /wil een ontwerp/);
  assert.match(providerBriefReceivedEmail("S", "Chez Nour", null, "https://x", "design").html, /veut un visuel/);
  assert.match(providerDateBookedEmail({ providerName: "S", restaurantName: "Chez Nour", dateLabel: "mardi 20 octobre", dateISO: "2026-10-20", startTime: "09:30", contact: "K", missionUrl: "https://x", locale: "en" }).subject, /Tuesday 20 October/);
});

test("rappels de tournage : le prestataire et le restaurateur dans leur langue, la plateforme en français", () => {
  const input = (key: MissionReminderInput["key"], audience: MissionReminderInput["audience"], extra: Partial<MissionReminderInput> = {}): MissionReminderInput => ({ key, audience, recipientName: "Studio", otherName: "Chez Nour", restaurantName: "Chez Nour", dateLabel: "mardi 20 octobre", dateISO: "2026-10-20", startTime: "09:30", contact: "Karim", url: "https://x", ...extra });
  for (const locale of LOCALES) {
    for (const m of [missionReminderEmail({ ...input("j2", "provider"), locale }), missionReminderEmail({ ...input("veille", "provider", { selfConfirmed: true, otherConfirmed: true }), locale }), missionReminderEmail({ ...input("veille", "provider"), locale })]) {
      for (const part of [m.subject, m.preheader, m.html, m.text]) assert.ok(part.length > 0 && !unresolved(part), `${locale} : ${part.slice(0, 60)}`);
    }
  }
  assert.match(missionReminderEmail({ ...input("j2", "provider"), locale: "nl" }).subject, /Bevestig je aanwezigheid/);
  assert.match(missionReminderEmail({ ...input("j2", "provider") }).subject, /Confirme ta présence/);
  assert.match(missionReminderEmail({ ...input("j7", "restaurant"), locale: "nl" }).subject, /Verwittig je team/);
  assert.match(missionReminderEmail({ ...input("j7", "restaurant") }).subject, /Préviens ton équipe/);
  assert.match(missionReminderEmail({ ...input("alerte", "platform", { missing: ["Chez Nour"] }), locale: "en" }).subject, /Présence non confirmée/);
});

test("la langue est retrouvée À L'ENVOI d'après l'adresse du prestataire, sans toucher aux autres destinataires", () => {
  const send = readFileSync("lib/email.ts", "utf8");
  assert.match(send, /sendProviderInviteEmail[\s\S]{0,300}getProviderLocaleByEmail\(to\)/);
  assert.match(send, /providerBriefReceivedEmail\([^)]*getProviderLocaleByEmail\(to\)/);
  assert.match(send, /input\.audience === "provider" \? await getProviderLocaleByEmail\(to\) : input\.audience === "restaurant" \? await getUserLocaleByEmail\(to\)/g);
  assert.match(send, /providerQuoteReceivedEmail\([^)]*getUserLocaleByEmail\(to\)/);
  const loc = readFileSync("lib/provider-locale.ts", "utf8");
  assert.match(loc, /\.eq\("email", email\.trim\(\)\.toLowerCase\(\)\)/);
  assert.doesNotMatch(loc, /ilike/);
});

// ── Lot 9 : les e-mails que reçoit le restaurateur ──
import { copyFor } from "../email-templates/mission-update";
import { restaurantCopy } from "../email-templates/mission-update-restaurant";
import { makeTranslator } from "./index";
import { fr } from "./messages/fr";

const RESTAURANT_KINDS: MissionUpdateKind[] = [
  "report_submitted", "delivered", "validation_reminder", "auto_validated", "bat_review", "bat_review_again", "bat_submitted", "message_received", "work_started", "cancelled",
  "dispute_opened", "dispute_resolved", "proposals_received", "proposal_auto", "proposals_choose", "change_quoted", "change_provider_declined", "change_expired",
];

function restaurantVariants(kind: MissionUpdateKind): MissionUpdateInput[] {
  const common = { ...base, audience: "restaurant" as const, kind, title: "Le geste du chef", count: 3, deadlineDay: "2026-10-22", providerPct: 40 };
  const none = { ...common, deadlineDay: undefined, title: undefined, count: undefined };
  if (kind === "cancelled") {
    const out: MissionUpdateInput[] = [];
    for (const cancelledBy of ["restaurant", "provider", "platform"] as const) for (const band of ["free", "half", "full", "deposit"] as const) for (const studio of [false, true]) out.push({ ...common, cancelledBy, band, studio });
    return out;
  }
  if (kind === "dispute_resolved") return (["pay", "refund", "split"] as const).map((decision) => ({ ...common, decision }));
  if (kind === "proposal_auto") return (["auto", "fallback"] as const).map((auto) => ({ ...common, auto }));
  if (kind === "validation_reminder") return ([1, 2] as const).map((round) => ({ ...common, round }));
  if (kind === "change_quoted") return [true, false].map((free) => ({ ...common, free }));
  if (kind === "delivered") return [true, false].map((print) => ({ ...common, print }));
  if (kind === "bat_submitted") return [1, 3].map((count) => ({ ...common, count }));
  return [common, none];
}

test("e-mails du restaurateur : le français par clés est celui d'avant, cas par cas", () => {
  const trFr = makeTranslator("fr", fr);
  let n = 0;
  for (const kind of RESTAURANT_KINDS) {
    for (const input of restaurantVariants(kind)) {
      // L'ancien texte reçoit le jour limite déjà formaté, comme l'appelant d'avant.
      const legacy = copyFor({ ...input, deadlineLabel: input.deadlineDay ? "jeudi 22 octobre" : undefined });
      const keyed = restaurantCopy(input, trFr);
      assert.deepEqual(keyed, legacy, `${kind} ${JSON.stringify(input)}`);
      n++;
    }
  }
  assert.ok(n > 40, `seulement ${n} cas`);
});

test("e-mails du restaurateur : complets dans les trois langues, sans variable oubliée", () => {
  for (const kind of RESTAURANT_KINDS) {
    for (const input of restaurantVariants(kind)) {
      for (const locale of LOCALES) {
        const m = missionUpdateEmail({ ...input, locale });
        for (const part of [m.subject, m.preheader, m.html, m.text]) {
          assert.ok(part.trim().length > 0, `${kind}/${locale} vide`);
          assert.ok(!unresolved(part), `${kind}/${locale} : variable oubliée dans « ${part.slice(0, 80)} »`);
        }
      }
    }
  }
  assert.notEqual(missionUpdateEmail({ ...base, audience: "restaurant", kind: "delivered", locale: "nl" }).subject, missionUpdateEmail({ ...base, audience: "restaurant", kind: "delivered" }).subject);
});
