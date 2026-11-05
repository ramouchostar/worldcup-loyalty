import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acceptanceScore,
  buildProfile,
  cleanRefusalNote,
  EMPTY_PROFILE,
  isTypeMuted,
  decideByInstant,
  decisionPatch,
  ideaKey,
  isVisibleToday,
  planCovers,
  rankIdeas,
  requiredPlan,
  selectIdeas,
  type SelectionContext,
} from "./proposals";
import { refusalLearnedText, type Idea } from "./types";
import type { HistoryRow } from "./proposals";

// Jeudi 5 novembre 2026, 9 h à Bruxelles (8 h UTC, heure d'hiver).
const NOW = Date.parse("2026-11-05T08:00:00Z");

function idea(over: Partial<Idea> = {}): Idea {
  return {
    assistant: "hugo",
    type: "clients_a_relancer",
    title: "12 clients ne reviennent plus",
    question: "Je leur écris ?",
    lines: { what: "Un message", who: "12 clients", cost: "0 €" },
    estimate: null,
    decideBy: "2026-11-10",
    action: { kind: "send_to_members", campaign: "hugo_winback", message: "Tu nous manques", label: "Envoyer" },
    evidence: {},
    ...over,
  };
}

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(NOW - n * DAY).toISOString();
/** Une décision passée (type « refusee » par défaut, celui de la clé). */
function refused(key: string, type: string, reason: HistoryRow["refusal_reason"], ago: number, status: HistoryRow["status"] = "refusee"): HistoryRow {
  return { idea_key: key, assistant: "hugo", type, status, decided_at: daysAgo(ago), refusal_reason: status === "refusee" ? reason : null };
}

const ctx = (over: Partial<SelectionContext> = {}): SelectionContext => ({
  plan: "pro",
  shownToday: 0,
  openKeys: new Set(),
  profile: EMPTY_PROFILE,
  nowMs: NOW,
  ...over,
});

test("une date limite seule vaut jusqu'à la fin du jour à Bruxelles", () => {
  assert.equal(decideByInstant("2026-11-05").toISOString(), "2026-11-05T22:59:59.999Z"); // hiver : UTC+1
  assert.equal(decideByInstant("2026-07-01").toISOString(), "2026-07-01T21:59:59.999Z"); // été : UTC+2
  assert.equal(decideByInstant("2026-11-05T15:00:00Z").toISOString(), "2026-11-05T15:00:00.000Z");
  assert.throws(() => decideByInstant("demain"));
});

test("le forfait : Chloé chiffre du jour en Gratuit, plat par plat en Croissance, Max en Pro", () => {
  assert.equal(requiredPlan({ assistant: "chloe", type: "ca_du_jour_a_noter" }), "gratuit");
  assert.equal(requiredPlan({ assistant: "chloe", type: "jour_creux_promo" }), "croissance");
  assert.equal(requiredPlan({ assistant: "max", type: "fiche_a_completer" }), "pro");
  assert.ok(planCovers("pro", "croissance"));
  assert.ok(!planCovers("croissance", "pro"));
});

test("l'anti-doublon distingue l'objet : deux plats, deux idées ; deux manques de fiche, deux idées", () => {
  const a = idea({ assistant: "chloe", type: "jour_creux_promo", evidence: { productId: "p1" } });
  const b = idea({ assistant: "chloe", type: "jour_creux_promo", evidence: { productId: "p2" } });
  assert.notEqual(ideaKey(a), ideaKey(b));
  assert.equal(ideaKey(a), "chloe:jour_creux_promo:p1");
  const fiche = (finding: string) =>
    idea({ assistant: "max", type: "fiche_a_completer", action: { kind: "update_fiche", finding, via: "equipe", needsInput: "", label: "Ajouter" } });
  assert.equal(ideaKey(fiche("horaires")), "max:fiche_a_completer:horaires");
  assert.equal(ideaKey(idea()), "hugo:clients_a_relancer");
});

test("tri : date limite la plus proche, puis celle qui a une estimation, puis l'ordre d'arrivée", () => {
  const late = idea({ type: "a", decideBy: "2026-11-12" });
  const soonNoEst = idea({ type: "b", decideBy: "2026-11-06" });
  const soonEst = idea({ type: "c", decideBy: "2026-11-06", estimate: { low: 1, high: 2, unit: "€", basis: "x" } });
  assert.deepEqual(rankIdeas([late, soonNoEst, soonEst]).map((i) => i.type), ["c", "b", "a"]);
});

test("trois idées par jour : la quatrième est écartée avec sa raison, jamais perdue", () => {
  const four = ["a", "b", "c", "d"].map((type, i) => idea({ type, decideBy: `2026-11-0${6 + i}` }));
  const s = selectIdeas(four, ctx());
  assert.deepEqual(s.show.map((i) => i.type), ["a", "b", "c"]);
  assert.deepEqual(s.discard.map((d) => [d.idea.type, d.reason]), [["d", "plafond_du_jour"]]);
});

test("le plafond tient compte de ce qui a déjà été montré aujourd'hui", () => {
  const s = selectIdeas([idea({ type: "a" }), idea({ type: "b" })], ctx({ shownToday: 2 }));
  assert.equal(s.show.length, 1);
  assert.equal(s.discard[0].reason, "plafond_du_jour");
});

test("forfait, idée déjà ouverte, refus récent, doublon dans le lot : chacun sa raison", () => {
  const s = selectIdeas(
    [
      idea({ assistant: "max", type: "fiche_a_completer" }),
      idea({ type: "ouverte" }),
      idea({ type: "refusee" }),
      idea({ type: "deux_fois" }),
      idea({ type: "deux_fois" }),
    ],
    ctx({
      plan: "croissance",
      openKeys: new Set(["hugo:ouverte"]),
      profile: buildProfile([refused("hugo:refusee", "refusee", "pas_le_moment", 2)], NOW),
    })
  );
  assert.deepEqual(s.show.map((i) => i.type), ["deux_fois"]);
  assert.deepEqual(
    s.discard.map((d) => [d.idea.type, d.reason]),
    [
      ["fiche_a_completer", "forfait"],
      ["ouverte", "deja_proposee"],
      ["deux_fois", "deja_proposee"],
      ["refusee", "refusee_recemment"], // un type déjà refusé passe après les autres (§8)
    ]
  );
});

test("un second passage le même jour ne réécrit pas une idée déjà écartée", () => {
  const four = ["a", "b", "c", "d"].map((type) => idea({ type }));
  const s = selectIdeas(four, ctx({ shownToday: 3, discardedTodayKeys: new Set(["hugo:a", "hugo:b"]) }));
  assert.deepEqual(s.discard.map((d) => d.idea.type), ["c", "d"]);
});

test("une idée déjà échue n'est ni montrée ni écartée", () => {
  const s = selectIdeas([idea({ decideBy: "2026-11-04" })], ctx());
  assert.equal(s.show.length + s.discard.length, 0);
});

test("Plus tard : cachée aujourd'hui, de retour demain ; échue : plus à décider", () => {
  const row = { status: "proposee" as const, snoozed_until: "2026-11-06", decide_by: "2026-11-10T22:59:59Z" };
  assert.ok(!isVisibleToday(row, "2026-11-05", NOW));
  assert.ok(isVisibleToday(row, "2026-11-06", NOW));
  assert.ok(!isVisibleToday({ ...row, snoozed_until: null, decide_by: "2026-11-05T07:00:00Z" }, "2026-11-05", NOW));
  assert.ok(!isVisibleToday({ ...row, status: "acceptee" }, "2026-11-06", NOW));
});

test("les décisions : Oui, Non avec raison, Plus tard ; rien sur une idée décidée ou échue", () => {
  const row = { status: "proposee" as const, decide_by: "2026-11-10T22:59:59Z", snooze_count: 0 };
  const c = { userId: "u1", nowMs: NOW };
  assert.equal(decisionPatch(row, { kind: "oui" }, c)?.status, "acceptee");
  const non = decisionPatch(row, { kind: "non", reason: "trop_cher" }, c);
  assert.equal(non?.status, "refusee");
  assert.equal(non?.refusal_reason, "trop_cher");
  const later = decisionPatch(row, { kind: "plus_tard" }, c);
  assert.equal(later?.status, undefined); // reste « proposée »
  assert.equal(later?.snoozed_until, "2026-11-06");
  assert.equal(later?.snooze_count, 1);
  assert.equal(decisionPatch({ ...row, status: "refusee" }, { kind: "oui" }, c), null);
  assert.equal(decisionPatch({ ...row, decide_by: "2026-11-05T07:00:00Z" }, { kind: "oui" }, c), null);
});

test("chaque raison a son délai : pas le moment 7 j, déjà fait 30 j, pas pour moi 60 j", () => {
  const sel = (reason: HistoryRow["refusal_reason"], ago: number) =>
    selectIdeas([idea({ type: "t" })], ctx({ profile: buildProfile([refused("hugo:t", "t", reason, ago)], NOW) }));
  assert.equal(sel("pas_le_moment", 6).discard[0]?.reason, "refusee_recemment");
  assert.equal(sel("pas_le_moment", 8).show.length, 1);
  assert.equal(sel("deja_fait", 20).discard[0]?.reason, "refusee_recemment");
  assert.equal(sel("deja_fait", 31).show.length, 1);
  assert.equal(sel("trop_cher", 20).discard[0]?.reason, "refusee_recemment");
});

test("un type refusé deux fois « pas pour mon établissement » se met en pause 30 jours, puis revient", () => {
  const hist = (ago: number) => [refused("hugo:t:a", "t", "pas_pour_moi", ago + 5), refused("hugo:t:b", "t", "pas_pour_moi", ago)];
  // Un AUTRE objet du même type est écarté aussi : c'est le type qui est appris.
  const muted = selectIdeas([idea({ type: "t", evidence: { productId: "c" } })], ctx({ profile: buildProfile(hist(3), NOW) }));
  assert.equal(muted.discard[0]?.reason, "appris");
  const back = selectIdeas([idea({ type: "t", evidence: { productId: "c" } })], ctx({ profile: buildProfile(hist(31), NOW) }));
  assert.equal(back.show.length, 1);
});

test("trois refus sans aucun Oui mettent le type en pause ; un seul Oui suffit à l'éviter", () => {
  const three = [1, 2, 3].map((d) => refused(`hugo:t:${d}`, "t", "pas_le_moment", d));
  assert.ok(isTypeMuted(buildProfile(three, NOW).types.get("hugo:t"), NOW));
  const withYes = [...three, refused("hugo:t:ok", "t", null, 4, "executee")];
  assert.ok(!isTypeMuted(buildProfile(withYes, NOW).types.get("hugo:t"), NOW));
});

test("au-delà de 90 jours, la brigade oublie", () => {
  const old = [1, 2, 3].map((d) => refused(`hugo:t:${d}`, "t", "pas_pour_moi", 90 + d));
  assert.equal(buildProfile(old, NOW).types.size, 0);
});

test("ce que l'établissement accepte passe devant, avant la date limite", () => {
  const profile = buildProfile(
    [
      refused("hugo:aime:1", "aime", null, 2, "acceptee"),
      refused("hugo:aime:2", "aime", null, 3, "executee"),
      refused("hugo:boude:1", "boude", "trop_cher", 2),
    ],
    NOW
  );
  assert.ok(acceptanceScore(profile.types.get("hugo:aime")) > acceptanceScore(profile.types.get("hugo:boude")));
  const urgentButDisliked = idea({ type: "boude", decideBy: "2026-11-06" });
  const liked = idea({ type: "aime", decideBy: "2026-11-12" });
  assert.deepEqual(rankIdeas([urgentButDisliked, liked], profile).map((i) => i.type), ["aime", "boude"]);
});

test("« Autre » : la saisie libre est gardée, nettoyée, jamais obligatoire", () => {
  assert.equal(cleanRefusalNote("  mes clients   n'aiment pas\nles promos "), "mes clients n'aiment pas les promos");
  assert.equal(cleanRefusalNote("   "), null);
  assert.equal(cleanRefusalNote(undefined), null);
  assert.equal(cleanRefusalNote("x".repeat(400))?.length, 280);
  const row = { status: "proposee" as const, decide_by: "2026-11-10T22:59:59Z", snooze_count: 0 };
  const p = decisionPatch(row, { kind: "non", reason: "autre", note: " trop de travail en cuisine " }, { userId: "u", nowMs: NOW });
  assert.equal(p?.refusal_note, "trop de travail en cuisine");
  assert.equal(decisionPatch(row, { kind: "non", reason: "trop_cher" }, { userId: "u", nowMs: NOW })?.refusal_note, null);
});

test("ce que le gérant lit après un refus", () => {
  assert.equal(refusalLearnedText("hugo", "pas_le_moment", false), "Compris. Hugo ne te reproposera pas ça avant 7 jours.");
  assert.match(refusalLearnedText("emma", "trop_cher", false), /Emma reviendra avec moins cher/);
  assert.match(refusalLearnedText("chloe", "autre", false), /l'équipe lit ta réponse/);
  assert.equal(refusalLearnedText("max", "pas_pour_moi", true), "Compris. Max arrête ce genre d'idée pendant 30 jours.");
  for (const a of ["hugo", "emma", "lea"] as const) assert.doesNotMatch(refusalLearnedText(a, "trop_cher", false), /€/);
});
