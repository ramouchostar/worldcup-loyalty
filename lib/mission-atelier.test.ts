import { test } from "node:test";
import assert from "node:assert/strict";
import { DESIGN_BRIEF_STEPS, DESIGN_MIN_DAYS, DESIGN_TEMPLATE, VIDEO_TEMPLATE, defaultTemplate, earliestDeadline, stepsFor, validateBrief, type BriefAnswers, type BriefIssueCode } from "./mission-brief";
import { changeableStatuses, familyOf, hasShoot, isStudio, providerLabel, PROVIDER_NOUN } from "./mission-metier";
import { cancellationOutcome } from "./mission-cancellation";
import { canCancel, describeCost, quoteCancellation } from "./mission-cancel-rules";
import { canTransition } from "./mission-states";
import { STUDIO_TIMELINE_STEPS, TIMELINE_STEPS, briefHeadline, briefRows, issueMessage, timeline } from "./mission-view";
import { judgeChangeRequest } from "./mission-changes";
import { STUDIO_PROVIDER_RULES, STUDIO_RESTAURANT_RULES, STUDIO_RULES_VERSION, RULES_VERSION, readAcceptance, rulesFor, rulesVersionFor, studioRulesFingerprint } from "./mission-rules";
import { missionUpdateEmail } from "./email-templates/mission-update";
import { providerBriefReceivedEmail } from "./email-templates/provider-brief-received";
import { FREE_CANCEL_HOURS } from "./mission-cancellation";
import { MIN_DEPOSIT_BPS } from "./mission-money";
import { AUTO_VALIDATE_DAYS, MAX_RETOUCH_ROUNDS } from "./mission-states";

const TODAY = "2026-10-19";

// ── les familles de métiers ──
test("vidéo et photo se tournent ; design et impression se travaillent à l'atelier", () => {
  assert.deepEqual((["video", "photo", "design", "impression"] as const).map(familyOf), ["tournage", "tournage", "atelier", "atelier"]);
  assert.equal(hasShoot("video"), true);
  assert.equal(hasShoot("design"), false);
  assert.equal(isStudio("impression"), true);
  assert.equal(providerLabel("design", null), "Le graphiste");
  assert.equal(providerLabel("design", "Studio Croustille"), "Studio Croustille");
  assert.equal(PROVIDER_NOUN.impression, "l'imprimeur");
  assert.deepEqual(changeableStatuses("video"), ["accepte", "date_bloquee"]);
  assert.deepEqual(changeableStatuses("design"), ["accepte", "production"]);
});

// ── le questionnaire design ──
const good: BriefAnswers = {
  what: ["Carte ou menu", "Flyer"],
  use: ["Salle", "Réseaux sociaux"],
  charte: "J'ai une charte",
  languages: ["Français", "Néerlandais"],
  style: "Chaleureux",
  likes: "Le menu de la brasserie Dupont : lisible, chaleureux, beaucoup d'air autour des plats.",
  content: "Burger maison 14, salade du chef 12, dessert du jour 6 ; ouvert du mardi au dimanche, 11h30 à 22h.",
  content_final: true,
  deadline: "2026-11-02",
  deciders: ["Nour"],
  deciders_attested: true,
  budget_cents: 45000,
};
const issues = (a: BriefAnswers) => validateBrief(a, DESIGN_TEMPLATE, TODAY).issues.map((i) => `${i.key}:${i.code}`);

test("le modèle design : chaque question du brief est dans UN écran de l'assistant, dans l'ordre", () => {
  const inBrief = DESIGN_TEMPLATE.questions.filter((q) => (q.phase ?? "brief") === "brief" && q.kind !== "files").map((q) => q.key);
  const inSteps = DESIGN_BRIEF_STEPS.flatMap((s) => s.keys);
  assert.deepEqual(inSteps, inBrief);
  assert.equal(new Set(inSteps).size, inSteps.length);
  assert.equal(DESIGN_TEMPLATE.questions.some((q) => q.phase === "tournage"), false); // aucune préparation de tournage
  assert.equal(stepsFor("design"), DESIGN_BRIEF_STEPS);
  assert.notEqual(stepsFor("video"), DESIGN_BRIEF_STEPS);
  assert.equal(defaultTemplate("design"), DESIGN_TEMPLATE);
  assert.equal(defaultTemplate("video"), VIDEO_TEMPLATE);
  assert.equal(defaultTemplate("photo"), null);
  assert.equal(defaultTemplate("impression")?.metier, "impression");
});

test("un brief design complet est recevable", () => {
  assert.deepEqual(issues(good), []);
});

test("le contenu doit être déclaré FINAL, et les décideurs attestés (cases qui engagent)", () => {
  assert.deepEqual(issues({ ...good, content_final: false }), ["content_final:not_attested"]);
  assert.deepEqual(issues({ ...good, deciders_attested: false }), ["deciders_attested:not_attested"]);
  assert.deepEqual(issues({ ...good, content: "Burger" }), ["content:too_short"]);
  assert.deepEqual(issues({ ...good, likes: "joli" }), ["likes:too_short"]);
});

test("le jour souhaité : au moins 5 jours devant, jamais passé", () => {
  assert.equal(DESIGN_MIN_DAYS, 5);
  assert.equal(earliestDeadline(TODAY), "2026-10-24");
  assert.deepEqual(issues({ ...good, deadline: "2026-10-24" }), []);
  assert.deepEqual(issues({ ...good, deadline: "2026-10-23" }), ["deadline:deadline_too_soon"]);
  assert.deepEqual(issues({ ...good, deadline: "2026-10-01" }), ["deadline:past"]);
  assert.deepEqual(issues({ ...good, deadline: undefined }), ["deadline:missing"]);
});

test("des supports et des langues connus seulement", () => {
  assert.deepEqual(issues({ ...good, what: ["Hologramme"] }), ["what:bad_option"]);
  assert.deepEqual(issues({ ...good, what: [] }), ["what:missing"]);
  assert.deepEqual(issues({ ...good, languages: ["Klingon"] }), ["languages:bad_option"]);
  assert.deepEqual(issues({ ...good, style: "Brutal" }), ["style:bad_option"]);
});

test("le brief design se lit en lignes, avec un titre court", () => {
  assert.equal(briefHeadline(good), "Carte ou menu, Flyer");
  assert.equal(briefHeadline({ goal: "Promotion" }), "Promotion");
  assert.equal(briefHeadline({}), null);
  assert.equal(briefHeadline(null), null);
  assert.ok(briefRows(good, DESIGN_TEMPLATE).some((r) => r.label === "Le contenu final"));
  assert.deepEqual(briefRows(good, DESIGN_TEMPLATE).find((r) => r.label === "Pour quand ?"), { label: "Pour quand ?", value: "lundi 2 novembre" }); // une date se lit en mots, jamais en ISO
  assert.match(issueMessage("deadline_too_soon" as BriefIssueCode), /5 jours/);
});

test("les codes de refus du brief ont chacun leur phrase, sans doublon", () => {
  const codes: BriefIssueCode[] = ["missing", "too_short", "too_soon", "deadline_too_soon", "past", "bad_option", "bad_phone", "not_attested", "budget_below_floor"];
  assert.equal(new Set(codes.map(issueMessage)).size, codes.length);
});

// ── la frise ──
test("la frise d'un métier d'atelier n'a pas de date de tournage", () => {
  assert.equal(TIMELINE_STEPS.some((s) => s.label === "Date réservée"), true);
  assert.equal(STUDIO_TIMELINE_STEPS.some((s) => /Date|tournage/.test(s.label)), false);
  const labels = (status: Parameters<typeof timeline>[0]) => timeline(status, "design").steps.map((s) => `${s.label}:${s.state}`);
  assert.deepEqual(labels("accepte"), ["Brief envoyé:done", "Devis:done", "Devis accepté:current", "Création en cours:todo", "Livraison:todo", "Validé:todo"]);
  assert.deepEqual(labels("production").map((x) => x.split(":")[1]), ["done", "done", "done", "current", "todo", "todo"]);
  assert.equal(timeline("accepte", "video").steps[2].label, "Date réservée");
  assert.equal(timeline("accepte").steps[2].label, "Date réservée"); // sans métier : la frise historique
});

// ── les états ──
test("le prestataire commence son travail sans date : accepte → production (lui seul)", () => {
  assert.equal(canTransition("accepte", "production", "provider").ok, true);
  assert.equal(canTransition("accepte", "production", "restaurant").ok, false);
  assert.equal(canTransition("accepte", "production", "platform").ok, false);
  assert.equal(canTransition("production", "livre", "provider").ok, true);
});

// ── l'annulation d'atelier ──
test("annulation d'atelier : gratuite avant le début ; ensuite l'acompte reste au prestataire", () => {
  const paid = 100_000;
  const provider = 87_500;
  const deposit = 20_000;
  const before = cancellationOutcome({ by: "restaurant", hoursBefore: Number.POSITIVE_INFINITY, paidCents: paid, providerCents: provider, studio: { started: false, depositCents: deposit } });
  assert.deepEqual(before, { band: "free", refundCents: paid, retainedCents: 0, providerPayoutCents: 0, platformKeepsCents: 0, providerSanction: "none" });
  const after = cancellationOutcome({ by: "restaurant", hoursBefore: Number.POSITIVE_INFINITY, paidCents: paid, providerCents: provider, studio: { started: true, depositCents: deposit } });
  assert.equal(after.band, "deposit");
  assert.equal(after.retainedCents, deposit);
  assert.equal(after.refundCents, paid - deposit);
  assert.equal(after.providerPayoutCents, 17_500); // 87,5 % de l'acompte
  assert.equal(after.platformKeepsCents, 2_500);
  assert.equal(after.providerPayoutCents + after.platformKeepsCents, after.retainedCents);
  assert.equal(after.providerSanction, "none");
});

test("annulation d'atelier par le prestataire : rembourse tout ; avertissement seulement après le début", () => {
  const f = (started: boolean) => cancellationOutcome({ by: "provider", hoursBefore: Number.POSITIVE_INFINITY, paidCents: 100_000, providerCents: 87_500, studio: { started, depositCents: 20_000 } });
  assert.deepEqual(f(false), { band: "free", refundCents: 100_000, retainedCents: 0, providerPayoutCents: 0, platformKeepsCents: 0, providerSanction: "none" });
  assert.equal(f(true).providerSanction, "avertissement");
  assert.equal(f(true).refundCents, 100_000);
  assert.equal(f(true).retainedCents, 0);
});

test("annulation d'atelier : l'acompte retenu ne dépasse jamais ce qui a été payé ; rien payé, rien retenu", () => {
  const o = (paid: number, deposit: number) => cancellationOutcome({ by: "restaurant", hoursBefore: 0, paidCents: paid, providerCents: Math.round(paid * 0.875), studio: { started: true, depositCents: deposit } });
  assert.equal(o(10_000, 50_000).retainedCents, 10_000);
  assert.equal(o(0, 0).retainedCents, 0);
  assert.equal(o(0, 20_000).providerPayoutCents, 0);
  assert.equal(o(100_000, -5).retainedCents, 0);
});

test("annulation d'atelier : qui peut annuler quand", () => {
  for (const s of ["brief", "envoye", "devis", "accepte", "production", "suspendu"] as const) assert.equal(canCancel("restaurant", s, "design"), true, s);
  assert.equal(canCancel("restaurant", "livre", "design"), false);
  assert.equal(canCancel("restaurant", "production", "video"), false); // un tournage commencé : la plateforme seule
  assert.equal(canCancel("restaurant", "date_bloquee", "video"), true);
  assert.equal(canCancel("restaurant", "date_bloquee", "design"), false); // un état qui n'existe pas à l'atelier
  assert.equal(canCancel("provider", "accepte", "impression"), true);
  assert.equal(canCancel("provider", "production", "impression"), true);
  assert.equal(canCancel("provider", "devis", "design"), false);
  assert.equal(canCancel("provider", "production", "video"), false);
});

test("annulation d'atelier : le coût est dit en mots d'atelier, jamais en jours de tournage", () => {
  const facts = { shootDate: null, shootStart: null, paidCents: 100_000, providerCents: 87_500, depositCents: 20_000, now: new Date("2026-10-19T08:00:00Z"), metier: "design" as const };
  const euros = (c: number) => `${c / 100} €`;
  const free = quoteCancellation({ ...facts, by: "restaurant", status: "accepte" });
  const started = quoteCancellation({ ...facts, by: "restaurant", status: "production" });
  assert.equal(free.band, "free");
  assert.equal(started.band, "deposit");
  assert.match(describeCost("restaurant", free, euros), /n'a pas commencé : l'annulation est gratuite/);
  assert.match(describeCost("restaurant", started, euros), /Le travail a commencé : l'acompte \(200 €\) reste au prestataire/);
  assert.match(describeCost("provider", quoteCancellation({ ...facts, by: "provider", status: "production" }), euros), /avertissement/);
  assert.doesNotMatch(describeCost("restaurant", started, euros) + describeCost("restaurant", free, euros), /tournage|48 h|7 jours/);
  // Le métier de tournage garde son barème en heures.
  const shoot = quoteCancellation({ ...facts, metier: "video", by: "restaurant", status: "date_bloquee", shootDate: "2026-10-20", shootStart: "08:00" });
  assert.equal(shoot.band, "full");
  assert.equal(FREE_CANCEL_HOURS, 168);
});

// ── les modifications d'atelier ──
test("une modification d'atelier se demande après le devis accepté, y compris pendant la création, sans limite de J-7", () => {
  const ctx = (status: string, metier: "video" | "design") => ({ status, shootDate: null, changes: [], metier });
  assert.equal(judgeChangeRequest(ctx("accepte", "design"), TODAY), "ok");
  assert.equal(judgeChangeRequest(ctx("production", "design"), TODAY), "ok");
  assert.equal(judgeChangeRequest(ctx("date_bloquee", "design"), TODAY), "not_now");
  assert.equal(judgeChangeRequest(ctx("production", "video"), TODAY), "not_now");
  assert.equal(judgeChangeRequest(ctx("livre", "design"), TODAY), "not_now");
  assert.equal(judgeChangeRequest({ status: "accepte", shootDate: null, changes: [] }, TODAY), "ok"); // sans métier : tournage, comme avant
});

// ── les règles d'atelier ──
test("les règles d'atelier ont leur version et leur empreinte épinglée", () => {
  assert.equal(STUDIO_RULES_VERSION, "2026-10-19");
  assert.notEqual(STUDIO_RULES_VERSION, RULES_VERSION);
  // Si ce test échoue : tu as modifié le texte des règles d'atelier. Change STUDIO_RULES_VERSION, puis mets l'empreinte à jour ici.
  assert.equal(studioRulesFingerprint(), "b4f755d5");
  assert.equal(rulesVersionFor("atelier"), STUDIO_RULES_VERSION);
  assert.equal(rulesVersionFor("tournage"), RULES_VERSION);
  assert.equal(rulesFor("restaurant", "atelier"), STUDIO_RESTAURANT_RULES);
  assert.equal(rulesFor("provider", "atelier"), STUDIO_PROVIDER_RULES);
});

test("les règles d'atelier ne parlent ni de tournage, ni d'équipe, ni de compte-rendu, ni d'euros", () => {
  const all = [...STUDIO_RESTAURANT_RULES, ...STUDIO_PROVIDER_RULES].map((r) => `${r.title} ${r.text}`).join("\n");
  assert.doesNotMatch(all, /tournage|équipe|compte-rendu|caméra|€|euro|12,5|87,5/i);
  for (const r of [...STUDIO_RESTAURANT_RULES, ...STUDIO_PROVIDER_RULES]) assert.ok(r.title.length > 5 && r.text.length > 40, r.title);
});

test("les chiffres des règles d'atelier sont ceux du code", () => {
  const r = STUDIO_RESTAURANT_RULES.map((x) => `${x.title} ${x.text}`).join("\n");
  assert.equal(MIN_DEPOSIT_BPS, 2000);
  assert.match(r, /acompte d'au moins 20 %/);
  assert.equal(MAX_RETOUCH_ROUNDS, 2);
  assert.match(r, /deux tours de retours/i);
  assert.equal(AUTO_VALIDATE_DAYS, 7);
  assert.match(r, /au bout de 7 jours, elle est validée automatiquement/);
  assert.match(r, /l'annulation est gratuite/);
  assert.match(r, /l'acompte reste au prestataire/);
  assert.match(STUDIO_PROVIDER_RULES.map((x) => x.text).join("\n"), /ton acompte te reste acquis/);
});

test("l'acceptation exige la version de SA famille", () => {
  assert.equal(readAcceptance({ accepted: true, version: STUDIO_RULES_VERSION }, STUDIO_RULES_VERSION).ok, true);
  assert.deepEqual(readAcceptance({ accepted: true, version: RULES_VERSION }, STUDIO_RULES_VERSION), { ok: false, reason: "outdated" });
  assert.deepEqual(readAcceptance({ accepted: true, version: STUDIO_RULES_VERSION }), { ok: false, reason: "outdated" }); // version du tournage par défaut
});

// ── les e-mails ──
test("les e-mails parlent de l'atelier quand c'est de l'atelier", () => {
  const base = { restaurantName: "Chez Nour", providerName: "Studio Croustille", url: "https://www.boosteats.be/x" } as const;
  const started = missionUpdateEmail({ ...base, kind: "work_started", audience: "restaurant" });
  assert.match(started.subject, /a commencé/);
  assert.doesNotMatch(started.subject + started.text, /€|euro/i);
  const free = missionUpdateEmail({ ...base, kind: "cancelled", audience: "provider", cancelledBy: "restaurant", band: "free", studio: true });
  const kept = missionUpdateEmail({ ...base, kind: "cancelled", audience: "provider", cancelledBy: "restaurant", band: "deposit", studio: true });
  assert.match(free.text, /avant le début du travail/);
  assert.match(kept.text, /après le début du travail/);
  assert.match(kept.text, /acompte te reste acquis/);
  for (const m of [free, kept]) assert.doesNotMatch(m.subject + m.text, /tournage|calendrier/i);
  const platform = missionUpdateEmail({ ...base, kind: "cancelled", audience: "platform", cancelledBy: "provider", band: "deposit", studio: true });
  assert.match(platform.text, /à la main/);
  assert.doesNotMatch(platform.text, /tournage/);
  assert.match(missionUpdateEmail({ ...base, kind: "delivered", audience: "restaurant" }).subject, /ton travail/);
  assert.match(providerBriefReceivedEmail("Studio", "Chez Nour", "Carte ou menu", "https://x", "design").html, /veut un visuel/);
  assert.match(providerBriefReceivedEmail("Studio", "Chez Nour", null, "https://x").html, /veut une vidéo/);
});
