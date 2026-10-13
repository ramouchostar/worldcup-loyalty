import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PROPOSAL_ISSUE_TEXT,
  REASON_ISSUE_TEXT,
  actionDeadline,
  autoChoice,
  dueProposalReminders,
  judgeChoose,
  judgeReject,
  judgeSubmit,
  proposalDeadlines,
  proposalPhase,
  sanitizeProposals,
  sanitizeReasons,
  validateProposals,
  validateReasons,
  type ProposalInput,
  type ProposalMissionState,
} from "./mission-proposals";
import { missionUpdateEmail, type MissionUpdateInput } from "./email-templates/mission-update";
import { conceptMessage, teamMessage } from "./mission-team-message";

// Le tournage est le mardi 10 novembre 2026 : J-4 = 6, J-3 = 7, J-2 = 8, J-1 = 9.
const D = "2026-11-10";
const idea = (n: number): ProposalInput => ({ title: `Idée numéro ${n}`, idea: "Le chef prépare le plat devant la caméra, en gros plan, puis le serveur le dépose en salle.", onsite: "3 plats prêts, le chef et un serveur", link: `https://www.instagram.com/reel/exemple${n}/` });
const state = (over: Partial<ProposalMissionState> = {}): ProposalMissionState => ({ status: "date_bloquee", shootDate: D, round: 0, rejectedAt: null, chosenId: null, ...over });

// ── la série ──
test("2 ou 3 idées complètes : recevable ; 1 ou 4 : refusé", () => {
  assert.equal(validateProposals([idea(1), idea(2)]).ok, true);
  assert.equal(validateProposals([idea(1), idea(2), idea(3)]).ok, true);
  assert.deepEqual(validateProposals([idea(1)]).issues, [{ code: "too_few" }]);
  assert.ok(validateProposals([idea(1), idea(2), idea(3), idea(4)]).issues.some((i) => i.code === "too_many"));
  assert.deepEqual(validateProposals([]).issues, [{ code: "too_few" }]);
});

test("chaque champ est exigé, avec son champ dans l'erreur", () => {
  const v = validateProposals([{ title: "", idea: "trop court", onsite: "", link: "" }, idea(2)]);
  const keys = v.issues.map((i) => `${i.field}:${i.code}@${i.index}`).sort();
  assert.deepEqual(keys, ["idea:too_short@0", "link:empty@0", "onsite:empty@0", "title:empty@0"]);
});

test("le lien : https seulement, sans identifiants, jamais javascript: ni data:", () => {
  const link = (l: string) => validateProposals([{ ...idea(1), link: l }, idea(2)]).issues.map((i) => i.code);
  assert.deepEqual(link("http://exemple.com/video"), ["link_not_https"]);
  assert.deepEqual(link("javascript:alert(1)"), ["link_not_https"]);
  assert.deepEqual(link("data:text/html,<b>x</b>"), ["link_not_https"]);
  assert.deepEqual(link("https://moi:secret@exemple.com/"), ["link_credentials"]);
  assert.deepEqual(link("pas un lien"), ["link_invalid"]);
  assert.deepEqual(link("https://localhost/"), ["link_invalid"]);
  assert.deepEqual(link("https://exemple.com/" + "a".repeat(500)), ["too_long"]);
  assert.deepEqual(link("https://exemple.com/video"), []);
});

test("deux titres identiques ne sont pas deux idées (casse et espaces ignorés)", () => {
  const v = validateProposals([idea(1), { ...idea(2), title: "  IDÉE   numéro 1 " }]);
  assert.deepEqual(v.issues, [{ code: "duplicate_title", index: 1, field: "title" }]);
});

test("la saisie venue du réseau est nettoyée : types, longueurs, au plus 4 lignes lues", () => {
  assert.deepEqual(sanitizeProposals(null), []);
  assert.deepEqual(sanitizeProposals({ proposals: "x" }), []);
  const s = sanitizeProposals({ proposals: [idea(1), 42, { title: 7, idea: null }, idea(4), idea(5), idea(6)] });
  assert.equal(s.length, 4);
  assert.deepEqual(s[1], { title: "", idea: "", onsite: "", link: "" });
  const long = sanitizeProposals({ proposals: [{ title: "x".repeat(500), idea: "", onsite: "", link: "" }] });
  assert.ok(long[0].title.length <= 81); // juste assez pour que la validation voie le dépassement
});

test("chaque motif a sa phrase", () => {
  for (const k of Object.keys(PROPOSAL_ISSUE_TEXT)) assert.ok((PROPOSAL_ISSUE_TEXT as Record<string, string>)[k].length > 10, k);
  for (const k of Object.keys(REASON_ISSUE_TEXT)) assert.ok((REASON_ISSUE_TEXT as Record<string, string>)[k].length > 10, k);
});

// ── les raisons d'un refus ──
test("une raison par proposition de la série, ni trop courte, ni trop longue, ni pour une proposition inconnue", () => {
  const ids = ["a", "b"];
  assert.equal(validateReasons({ a: "trop long à tourner", b: "on n'a pas ces plats" }, ids).ok, true);
  assert.deepEqual(validateReasons({ a: "trop long à tourner" }, ids).issues, [{ id: "b", code: "missing" }]);
  assert.deepEqual(validateReasons({ a: "trop long à tourner", b: "non" }, ids).issues, [{ id: "b", code: "too_short" }]);
  assert.deepEqual(validateReasons({ a: "x".repeat(501), b: "on n'a pas ces plats" }, ids).issues, [{ id: "a", code: "too_long" }]);
  assert.deepEqual(validateReasons({ a: "trop long à tourner", b: "on n'a pas ces plats", z: "intrus" }, ids).issues, [{ id: null, code: "unknown_proposal" }]);
});

test("les raisons venues du réseau : seules les chaînes passent", () => {
  assert.deepEqual(sanitizeReasons({ reasons: { a: " ok ça ", b: 3, c: null } }), { a: "ok ça" });
  assert.deepEqual(sanitizeReasons({ reasons: [1, 2] }), {});
  assert.deepEqual(sanitizeReasons(null), {});
});

// ── les dates ──
test("les jours qui comptent, depuis le jour du tournage", () => {
  assert.deepEqual(proposalDeadlines(D), { providerDue: "2026-11-06", providerLast: "2026-11-07", rejectLast: "2026-11-07", secondLast: "2026-11-08", autoFirst: "2026-11-08", autoSecond: "2026-11-09" });
});

test("la phase suit les données : rien, à proposer, à choisir, seconde série, choisie", () => {
  assert.equal(proposalPhase(state()), "awaiting_proposals");
  assert.equal(proposalPhase(state({ round: 1 })), "choose");
  assert.equal(proposalPhase(state({ round: 1, rejectedAt: "2026-11-02T10:00:00Z" })), "awaiting_second");
  assert.equal(proposalPhase(state({ round: 2, rejectedAt: "2026-11-02T10:00:00Z" })), "choose_second");
  assert.equal(proposalPhase(state({ round: 1, chosenId: "p1" })), "chosen");
  assert.equal(proposalPhase(state({ status: "accepte", shootDate: null })), "not_applicable");
  assert.equal(proposalPhase(state({ status: "livre" })), "not_applicable");
});

test("le prestataire dépose jusqu'à J-3 ; la seconde série jusqu'à J-2 ; jamais hors de propos", () => {
  assert.equal(judgeSubmit(state(), "2026-11-01"), "ok");
  assert.equal(judgeSubmit(state(), "2026-11-07"), "ok"); // J-3 : en retard mais accepté
  assert.equal(judgeSubmit(state(), "2026-11-08"), "too_late");
  const second = state({ round: 1, rejectedAt: "x" });
  assert.equal(judgeSubmit(second, "2026-11-08"), "ok");
  assert.equal(judgeSubmit(second, "2026-11-09"), "too_late");
  assert.equal(judgeSubmit(state({ round: 1 }), "2026-11-01"), "not_expected"); // une série attend déjà son choix
  assert.equal(judgeSubmit(state({ round: 2, rejectedAt: "x" }), "2026-11-01"), "not_expected"); // jamais de troisième série
  assert.equal(judgeSubmit(state({ chosenId: "p" }), "2026-11-01"), "not_expected");
});

test("le restaurateur choisit jusqu'à la veille ; une idée choisie ne se rechoisit pas", () => {
  assert.equal(judgeChoose(state({ round: 1 }), "2026-11-09"), "ok");
  assert.equal(judgeChoose(state({ round: 1 }), D), "too_late");
  assert.equal(judgeChoose(state({ round: 2, rejectedAt: "x" }), "2026-11-09"), "ok");
  assert.equal(judgeChoose(state({ round: 1, chosenId: "p" }), "2026-11-05"), "not_expected");
  assert.equal(judgeChoose(state(), "2026-11-05"), "not_expected");
});

test("« aucune ne me plaît » : une seule fois, sur la première série, jusqu'à J-3", () => {
  assert.equal(judgeReject(state({ round: 1 }), "2026-11-07"), "ok");
  assert.equal(judgeReject(state({ round: 1 }), "2026-11-08"), "too_late");
  assert.equal(judgeReject(state({ round: 1, rejectedAt: "x" }), "2026-11-05"), "not_expected");
  assert.equal(judgeReject(state({ round: 2, rejectedAt: "x" }), "2026-11-05"), "not_expected"); // jamais deux demandes
  assert.equal(judgeReject(state({ round: 1, chosenId: "p" }), "2026-11-05"), "not_expected");
});

test("la retenue d'office : la 1re à J-2 (silence), la 1re de la seconde à J-1, repli sur la 1re série à J-1", () => {
  assert.equal(autoChoice(state({ round: 1 }), "2026-11-07"), null);
  assert.deepEqual(autoChoice(state({ round: 1 }), "2026-11-08"), { round: 1, kind: "auto" });
  assert.deepEqual(autoChoice(state({ round: 1 }), "2026-11-09"), { round: 1, kind: "auto" }); // un cron raté un jour rattrape
  assert.equal(autoChoice(state({ round: 1, rejectedAt: "x" }), "2026-11-08"), null);
  assert.deepEqual(autoChoice(state({ round: 1, rejectedAt: "x" }), "2026-11-09"), { round: 1, kind: "fallback" });
  assert.equal(autoChoice(state({ round: 2, rejectedAt: "x" }), "2026-11-08"), null);
  assert.deepEqual(autoChoice(state({ round: 2, rejectedAt: "x" }), "2026-11-09"), { round: 2, kind: "auto" });
  // Rien à retenir : aucune série, déjà choisie, hors de propos.
  assert.equal(autoChoice(state(), "2026-11-09"), null);
  assert.equal(autoChoice(state({ round: 1, chosenId: "p" }), "2026-11-09"), null);
  assert.equal(autoChoice(state({ status: "production", round: 1 }), "2026-11-09"), null);
});

test("la date limite dite à chacun", () => {
  assert.deepEqual(actionDeadline(state()), { who: "provider", day: "2026-11-06" });
  assert.deepEqual(actionDeadline(state({ round: 1 })), { who: "restaurant", day: "2026-11-07" });
  assert.deepEqual(actionDeadline(state({ round: 1, rejectedAt: "x" })), { who: "provider", day: "2026-11-08" });
  assert.deepEqual(actionDeadline(state({ round: 2, rejectedAt: "x" })), { who: "restaurant", day: "2026-11-08" });
  assert.equal(actionDeadline(state({ chosenId: "p" })), null);
});

test("la retenue d'office tombe le jour même où la date limite dite est passée (jamais avant)", () => {
  for (const s of [state({ round: 1 }), state({ round: 2, rejectedAt: "x" })]) {
    const last = actionDeadline(s)!.day;
    assert.equal(autoChoice(s, last), null, "le dernier jour, le restaurateur peut encore choisir");
    const next = new Date(`${last}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    assert.notEqual(autoChoice(s, next.toISOString().slice(0, 10)), null, "le lendemain, c'est retenu");
  }
});

// ── les rappels ──
const withId = (s: ProposalMissionState, id = "m1") => ({ id, ...s });

test("rappel au prestataire de J-4 à J-3, alerte plateforme dès J-2, jamais avant", () => {
  const due = (today: string, sent: string[] = []) => dueProposalReminders([withId(state())], today, new Set(sent)).map((d) => `${d.key}:${d.audience}`);
  assert.deepEqual(due("2026-11-05"), []);
  assert.deepEqual(due("2026-11-06"), ["propose:provider"]);
  assert.deepEqual(due("2026-11-07"), ["propose:provider"]);
  assert.deepEqual(due("2026-11-08"), ["sans_proposition:platform"]);
  assert.deepEqual(due("2026-11-09"), ["sans_proposition:platform"]);
  assert.deepEqual(due("2026-11-06", ["m1:propose:provider"]), []); // jamais deux fois
});

test("rappel au restaurateur qui n'a pas choisi : de J-4 à J-3, pas après la retenue d'office", () => {
  const due = (today: string, s = state({ round: 1 })) => dueProposalReminders([withId(s)], today, new Set()).map((d) => `${d.key}:${d.audience}`);
  assert.deepEqual(due("2026-11-05"), []);
  assert.deepEqual(due("2026-11-06"), ["choisir:restaurant"]);
  assert.deepEqual(due("2026-11-07"), ["choisir:restaurant"]);
  assert.deepEqual(due("2026-11-08"), []); // la retenue d'office passe avant
  assert.deepEqual(due("2026-11-06", state({ round: 1, chosenId: "p" })), []);
  assert.deepEqual(due("2026-11-06", state({ round: 1, rejectedAt: "x" })), []); // c'est au prestataire d'agir
});

test("un tournage passé ou une mission hors de propos ne rappelle rien", () => {
  assert.deepEqual(dueProposalReminders([withId(state({ shootDate: "2026-11-01" }))], "2026-11-06", new Set()), []);
  assert.deepEqual(dueProposalReminders([withId(state({ status: "accepte" }))], "2026-11-06", new Set()), []);
});

// ── les e-mails ──
const mail = (over: Partial<MissionUpdateInput>) => missionUpdateEmail({ kind: "proposals_received", audience: "restaurant", restaurantName: "Chez Nour", providerName: "Studio Lumière", url: "https://www.boosteats.be/x", ...over });

test("chaque e-mail des idées dit le fait, porte le lien, et ne contient aucun montant", () => {
  const cases: Partial<MissionUpdateInput>[] = [
    { kind: "proposals_received", audience: "restaurant", count: 3, deadlineLabel: "samedi 7 novembre" },
    { kind: "proposals_again", audience: "provider", deadlineLabel: "dimanche 8 novembre" },
    { kind: "proposal_chosen", audience: "provider", title: "Le geste du chef" },
    { kind: "proposal_auto", audience: "restaurant", title: "Le geste du chef", auto: "auto" },
    { kind: "proposal_auto", audience: "provider", title: "Le geste du chef", auto: "fallback" },
    { kind: "proposals_due", audience: "provider", deadlineLabel: "samedi 7 novembre" },
    { kind: "proposals_choose", audience: "restaurant", count: 2, deadlineLabel: "samedi 7 novembre" },
    { kind: "proposals_missing", audience: "platform", deadlineLabel: "mardi 10 novembre" },
  ];
  for (const c of cases) {
    const m = mail(c);
    const label = `${c.kind}/${c.audience}`;
    assert.ok(m.subject.length > 10, label);
    assert.ok(m.html.includes("https://www.boosteats.be/x"), label);
    assert.ok(m.text.includes("https://www.boosteats.be/x"), label);
    assert.doesNotMatch(m.subject + m.text, /€|euro/i, label);
    assert.doesNotMatch(m.html, /undefined|\[object/, label);
  }
});

test("la retenue d'office dit pourquoi, selon le cas, et le titre retenu", () => {
  const silence = mail({ kind: "proposal_auto", audience: "restaurant", title: "Le geste du chef", auto: "auto" }).text;
  const repli = mail({ kind: "proposal_auto", audience: "provider", title: "Le geste du chef", auto: "fallback" }).text;
  assert.match(silence, /pas eu de réponse à temps/);
  assert.match(repli, /nouvelle série n'est pas arrivée à temps/);
  assert.match(silence, /Le geste du chef/);
});

test("le titre d'une idée est échappé dans l'e-mail (texte du prestataire)", () => {
  const m = mail({ kind: "proposal_chosen", audience: "provider", title: '<img src=x onerror="alert(1)">' });
  assert.doesNotMatch(m.html, /<img src=x/);
});

// ── le message d'équipe ──
test("l'idée retenue entre dans le message d'équipe, et le message de précision est sans montant", () => {
  const base = { shootDate: D, startTime: "10:00", providerName: "Studio Lumière", roles: ["Cuisinier"], kitchen: "Oui", contactName: "Nour", contactPhone: "0470 00 00 00" };
  assert.doesNotMatch(teamMessage(base), /On tourne|on tourne/);
  assert.match(teamMessage({ ...base, concept: { title: "Le geste du chef", onsite: "3 plats prêts" } }), /on tourne « Le geste du chef » : prévoir 3 plats prêts/);
  const c = conceptMessage({ shootDate: D, startTime: "10:00", providerName: "Studio Lumière", title: "Le geste du chef", onsite: "3 plats prêts, le chef et un serveur" });
  assert.match(c, /mardi 10 novembre à 10:00/);
  assert.match(c, /« Le geste du chef »/);
  assert.match(c, /À prévoir : 3 plats prêts, le chef et un serveur\./);
  assert.doesNotMatch(c, /€|euro/i);
});

// ── la migration ──
test("la migration autorise exactement les clés de rappel du code, et borne les champs comme le code", () => {
  const sql = readFileSync("docs/migrations/20261013-1200-prestataires-propositions.sql", "utf8");
  for (const k of ["propose", "choisir", "sans_proposition", "j7", "j2", "veille", "alerte"]) assert.ok(sql.includes(`'${k}'`), k);
  assert.match(sql, /title\s+TEXT NOT NULL CHECK \(char_length\(title\) BETWEEN 3 AND 80\)/);
  assert.match(sql, /idea\s+TEXT NOT NULL CHECK \(char_length\(idea\) BETWEEN 30 AND 800\)/);
  assert.match(sql, /onsite\s+TEXT NOT NULL CHECK \(char_length\(onsite\) BETWEEN 5 AND 500\)/);
  assert.match(sql, /rejection_reason IS NULL OR char_length\(rejection_reason\) BETWEEN 12 AND 500/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
});
