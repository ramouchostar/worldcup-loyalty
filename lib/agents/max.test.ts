import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_AUDIT_AGE_DAYS, MAX_IDEAS_LIMIT, maxDecision, type MaxInput } from "./max";
import type { Criterion, CriterionStatus, FicheScore } from "../audit/fiche-score";

const TODAY = "2026-11-05";

function crit(key: string, status: CriterionStatus, points: number, detail?: string): Criterion {
  return { key, block: "identite", label: key, points, status, ...(detail ? { detail } : {}) };
}

/** Une fiche où tout est en ordre ; chaque test en abîme un critère. */
function fiche(over: Record<string, Criterion> = {}): FicheScore {
  const base: Record<string, Criterion> = {
    horaires: crit("horaires", "ok", 8),
    photos: crit("photos", "ok", 8, "80 photos"),
    attributs: crit("attributs", "ok", 7, "14 attributs"),
    lien_commande: crit("lien_commande", "ok", 5),
    telephone: crit("telephone", "ok", 5),
    site: crit("site", "ok", 5),
    lien_menu: crit("lien_menu", "ok", 3),
    description: crit("description", "ok", 3),
    reponses: crit("reponses", "ok", 5, "90 % sur 12 mois"),
    note: crit("note", "ok", 7),
    volume: crit("volume", "ok", 5),
  };
  return { score: 90, verified: 11, total: 11, criteria: Object.values({ ...base, ...over }), gaps: [] };
}

function input(over: Partial<MaxInput> = {}): MaxInput {
  return { restaurantId: "demo-x", todayISO: TODAY, hasPlace: true, auditAgeDays: 10, auditDate: "2026-10-26", fiche: fiche(), ficheManaged: false, ...over };
}

test("une fiche complète : Max ne dit rien, et dit pourquoi", () => {
  const d = maxDecision(input());
  assert.deepEqual(d.ideas, []);
  assert.equal(d.reason, "rien_a_signaler");
});

test("des horaires absents deviennent une idée qui demande les jours et les heures au gérant", () => {
  const d = maxDecision(input({ fiche: fiche({ horaires: crit("horaires", "manquant", 8) }) }));
  assert.equal(d.reason, null);
  assert.equal(d.ideas.length, 1);
  const i = d.ideas[0];
  assert.equal(i.assistant, "max");
  assert.equal(i.type, "fiche_a_completer");
  assert.equal(i.finding, "horaires");
  assert.equal(i.title, "Tes horaires ne sont pas sur ta fiche Google");
  assert.equal(i.question, "Je m'en occupe ?");
  assert.equal(i.estimate, null); // un constat ne promet aucun gain
  assert.equal(i.decideBy, "2026-11-12");
  assert.deepEqual(i.action, { kind: "update_fiche", finding: "horaires", via: "equipe", needsInput: "tes jours et tes heures d'ouverture", label: "Oui, m'en occuper" });
});

test("tant que la fiche n'est pas gérée par Boosteats, l'exécution passe par l'équipe ; ensuite par l'API", () => {
  const f = fiche({ lien_commande: crit("lien_commande", "manquant", 5) });
  const equipe = maxDecision(input({ fiche: f })).ideas[0];
  const api = maxDecision(input({ fiche: f, ficheManaged: true })).ideas[0];
  assert.equal(equipe.action.kind === "update_fiche" && equipe.action.via, "equipe");
  assert.equal(api.action.kind === "update_fiche" && api.action.via, "api");
  assert.match(equipe.lines.who, /l'équipe Boosteats met ta fiche à jour/);
  assert.match(api.lines.who, /je mets ta fiche à jour/);
});

test("classement : le plus de points d'abord, puis l'ordre de la grille, et pas plus de 3 idées", () => {
  assert.equal(MAX_IDEAS_LIMIT, 3);
  const d = maxDecision(
    input({
      fiche: fiche({
        telephone: crit("telephone", "manquant", 5),
        lien_commande: crit("lien_commande", "manquant", 5),
        attributs: crit("attributs", "manquant", 7),
        photos: crit("photos", "partiel", 8, "20 photos"),
        horaires: crit("horaires", "manquant", 8),
      }),
    })
  );
  // horaires (8) et photos (8) : à égalité, l'ordre de la grille ; puis attributs (7) ; les deux 5 points restent dehors.
  assert.deepEqual(d.ideas.map((i) => i.finding), ["horaires", "photos", "attributs"]);
  // Sans plafond, tout sort.
  assert.equal(maxDecision(input({ fiche: fiche({ telephone: crit("telephone", "manquant", 5), lien_commande: crit("lien_commande", "manquant", 5) }) }), 10).ideas.length, 2);
});

test("un critère non vérifié ne déclenche jamais d'idée : on ne devine pas un manque", () => {
  const d = maxDecision(input({ fiche: fiche({ horaires: crit("horaires", "non_verifie", 8), lien_commande: crit("lien_commande", "non_verifie", 5), photos: crit("photos", "non_verifie", 8) }) }));
  assert.equal(d.reason, "rien_a_signaler");
});

test("la note et le volume d'avis ne sont pas des gestes de fiche : jamais une idée", () => {
  const d = maxDecision(input({ fiche: fiche({ note: crit("note", "manquant", 7), volume: crit("volume", "manquant", 5) }) }));
  assert.equal(d.reason, "rien_a_signaler");
});

test("les photos : le nombre lu par l'audit est dit au gérant", () => {
  const i = maxDecision(input({ fiche: fiche({ photos: crit("photos", "manquant", 8, "12 photos") }) })).ideas[0];
  assert.equal(i.title, "Ta fiche Google a peu de photos (12)");
  assert.equal(maxDecision(input({ fiche: fiche({ photos: crit("photos", "manquant", 8) }) })).ideas[0].title, "Ta fiche Google a peu de photos");
});

test("un site qui pointe vers un réseau social (partiel) n'est pas un site absent", () => {
  assert.equal(maxDecision(input({ fiche: fiche({ site: crit("site", "partiel", 5, "Pointe vers un réseau social") }) })).reason, "rien_a_signaler");
  assert.equal(maxDecision(input({ fiche: fiche({ site: crit("site", "manquant", 5) }) })).ideas[0].finding, "site");
});

test("les avis sans réponse sont l'affaire de Louis : Max n'en fait plus une idée (pas de doublon le même matin)", () => {
  const d = maxDecision(input({ fiche: fiche({ reponses: crit("reponses", "manquant", 5, "10 % sur 12 mois") }) }));
  assert.equal(d.ideas.length, 0);
  assert.equal(d.reason, "rien_a_signaler");
  // Un autre manque de la fiche reste proposé, sans mention des avis.
  const both = maxDecision(input({ fiche: fiche({ reponses: crit("reponses", "manquant", 5), telephone: crit("telephone", "manquant", 5) }) }));
  assert.deepEqual(both.ideas.map((x) => x.finding), ["telephone"]);
});

test("pas de constat par jour : Max ne prétend jamais qu'un jour de la semaine manque", () => {
  const f = fiche({ horaires: crit("horaires", "manquant", 8), photos: crit("photos", "manquant", 8, "3 photos"), attributs: crit("attributs", "manquant", 7), lien_commande: crit("lien_commande", "manquant", 5) });
  const all = maxDecision(input({ fiche: f }), 10).ideas;
  assert.ok(all.length >= 4);
  for (const i of all) assert.doesNotMatch(JSON.stringify([i.title, i.lines]), /lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche/i);
});

test("les raisons de se taire, dans l'ordre", () => {
  assert.equal(maxDecision(input({ hasPlace: false, auditAgeDays: null, fiche: null })).reason, "pas_de_fiche");
  assert.equal(maxDecision(input({ auditAgeDays: null, fiche: null, auditDate: null })).reason, "pas_d_audit");
  assert.equal(maxDecision(input({ fiche: null })).reason, "audit_illisible");
  assert.equal(maxDecision(input({ auditAgeDays: MAX_AUDIT_AGE_DAYS + 1 })).reason, "audit_ancien");
});

test("une analyse de plus de 30 jours ne sert plus : même avec des manques, rien n'est proposé", () => {
  const f = fiche({ horaires: crit("horaires", "manquant", 8) });
  assert.equal(MAX_AUDIT_AGE_DAYS, 30);
  assert.equal(maxDecision(input({ fiche: f, auditAgeDays: 30 })).ideas.length, 1); // 30 jours : encore bon
  const old = maxDecision(input({ fiche: f, auditAgeDays: 41 }));
  assert.deepEqual(old.ideas, []);
  assert.equal(old.reason, "audit_ancien");
  assert.equal(old.ageDays, 41); // l'âge est rendu : c'est lui qui dit à l'équipe de refaire l'analyse
});

test("la trace garde le critère, son statut, ses points, la date et l'âge de l'analyse", () => {
  const i = maxDecision(input({ auditAgeDays: 12, auditDate: "2026-10-24", fiche: fiche({ photos: crit("photos", "partiel", 8, "20 photos") }) })).ideas[0];
  assert.deepEqual(i.evidence, { criterion: "photos", status: "partiel", points: 8, detail: "20 photos", auditDate: "2026-10-24", auditAgeDays: 12 });
});

test("ta fiche reste la tienne : le coût le dit, et l'idée ne promet aucun chiffre", () => {
  const i = maxDecision(input({ fiche: fiche({ horaires: crit("horaires", "manquant", 8) }) })).ideas[0];
  assert.match(i.lines.cost, /ta fiche reste la tienne/);
  assert.equal(i.estimate, null);
});
