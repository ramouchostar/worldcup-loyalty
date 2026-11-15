import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  announcementResults,
  groupAnnouncements,
  monthSummary,
  quietestDay,
  recommend,
  type RecoInput,
  type RevenueDay,
} from "./marketing-space";

const TODAY = "2026-11-15"; // un dimanche

/** 8 semaines : 1 000 € par jour, sauf le mardi à 600 €. */
function weeks(tuesday = 600, n = 56): RevenueDay[] {
  const out: RevenueDay[] = [];
  for (let i = 1; i <= n; i++) {
    const day = addDays(TODAY, -i);
    const isTuesday = new Date(`${day}T12:00:00Z`).getUTCDay() === 2;
    out.push({ day, amount: isTuesday ? tuesday : 1000, closed: false });
  }
  return out;
}

const BASE: RecoInput = {
  base: "/admin/houba",
  restaurantName: "Belchicken Houba",
  today: TODAY,
  ideas: [],
  revenue: null,
  promoReachable: 184,
  pubOpen: true,
  pubEver: true,
  lastAnnouncement: "2026-11-10",
};

test("jour calme : le mardi, 15 % sous la moyenne au moins", () => {
  const q = quietestDay(weeks(), TODAY);
  assert.ok(q);
  assert.equal(q.name, "mardi");
  assert.ok(q.gap < -0.3);
});

test("jour calme : rien sous 28 jours notés, rien si l'écart est faible, un jour vide n'est pas 0 €", () => {
  assert.equal(quietestDay(weeks(600, 20), TODAY), null);
  assert.equal(quietestDay(weeks(900), TODAY), null);
  const withHoles = weeks().map((d) => (d.amount === 600 ? { ...d, amount: null } : d));
  assert.equal(quietestDay(withHoles, TODAY), null);
  const closed = weeks().map((d) => (d.amount === 600 ? { ...d, closed: true } : d));
  assert.equal(quietestDay(closed, TODAY), null);
});

test("recommandation : une idée marketing de la brigade passe avant les chiffres, et mène à Idées", () => {
  const r = recommend({
    ...BASE,
    revenue: weeks(),
    ideas: [
      { id: "1", assistant: "chloe" as never, title: "pas du marketing", question: "", lines: { what: "", who: "", cost: "" } },
      { id: "2", assistant: "hugo", title: "38 clients ne sont pas revenus", question: "On les relance ?", lines: { what: "Un message", who: "38 clients", cost: "0 €" } },
    ],
  });
  assert.equal(r?.kind, "idee");
  assert.equal(r?.title, "38 clients ne sont pas revenus");
  assert.equal(r?.cta.href, "/admin/houba/idees");
});

test("recommandation : le jour calme prépare l'annonce, message prérempli", () => {
  const r = recommend({ ...BASE, revenue: weeks() });
  assert.equal(r?.kind, "jour_calme");
  assert.match(r?.cta.href ?? "", /^\/admin\/houba\/broadcast\?prefill=Mardi\+chez\+Belchicken\+Houba/);
  assert.equal(r?.facts[1].value, "184");
});

test("recommandation : première pub, puis annonce après 14 jours sans nouvelles, sinon rien", () => {
  assert.equal(recommend({ ...BASE, pubEver: false })?.kind, "premiere_pub");
  assert.equal(recommend({ ...BASE, pubOpen: false, pubEver: false }), null);
  assert.equal(recommend({ ...BASE, lastAnnouncement: "2026-10-20" })?.kind, "annonce");
  assert.equal(recommend({ ...BASE, lastAnnouncement: null })?.kind, "annonce");
  assert.equal(recommend(BASE), null);
  assert.equal(recommend({ ...BASE, lastAnnouncement: null, promoReachable: 0 }), null);
  assert.equal(recommend({ ...BASE, lastAnnouncement: null, promoReachable: null }), null);
});

test("annonces : regroupées par jour et texte, comparées aux mêmes jours de la semaine d'avant", () => {
  const ann = groupAnnouncements([
    { day: "2026-11-03", message: "Family Bucket" },
    { day: "2026-11-03", message: "Family Bucket" },
    { day: "2026-11-03", message: " " },
    { day: "2026-11-14", message: "Ce soir" },
  ]);
  assert.deepEqual(ann, [
    { day: "2026-11-03", message: "Family Bucket", recipients: 2 },
    { day: "2026-11-14", message: "Ce soir", recipients: 1 },
  ]);
  const tickets = ["2026-10-27", "2026-10-28", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-05", "2026-11-06"];
  const res = announcementResults(ann, tickets, TODAY);
  assert.equal(res[0].day, "2026-11-14");
  assert.equal(res[0].partial, true);
  assert.deepEqual({ after: res[1].after, before: res[1].before, partial: res[1].partial }, { after: 4, before: 2, partial: false });
});

test("résumé du mois : une phrase, rien quand il ne s'est rien passé", () => {
  assert.equal(monthSummary({ actions: 0, reached: null, vouchersRedeemed: 0 }), null);
  assert.equal(monthSummary({ actions: 1, reached: null, vouchersRedeemed: 0 }), "Ce mois-ci : 1 action lancée.");
  assert.equal(
    (monthSummary({ actions: 2, reached: 11634, vouchersRedeemed: 3 }) ?? "").replace(/ | /g, " "),
    "Ce mois-ci : 2 actions lancées, 11 634 personnes touchées autour du resto et 3 bons de pub utilisés en caisse."
  );
});
