// Données d'exemple des séquences — établissement FICTIF (« Poulet Doré »),
// chiffres inventés mais à l'échelle d'un vrai établissement du réseau
// (panier moyen ≈ 18 €, ~180 points par ticket moyen, ADR 0061). Servent à
// l'aperçu des gabarits (scripts/email-preview.ts) et, plus tard, à l'aperçu
// dans la console plateforme. Jamais envoyées à personne.

import { foodIconUrl } from "../food-icon";
import { firstTicketEmail, firstTicketShort } from "./member-first-ticket";
import { teamInviteEmail, teamInviteShort } from "./member-team-invite";
import { referralNudgeEmail, referralNudgeShort } from "./member-referral-nudge";
import { installAppEmail } from "./member-install-app";
import { milestoneEmail } from "./pro-milestone";
import { recapHeadline, weeklyRecapEmail } from "./pro-weekly-recap";
import { weeklyIdeaEmail } from "./pro-weekly-idea";
import { welcomeEmail } from "./welcome";
import { rewardReadyEmail } from "./reward-ready";
import { tierUnlockedEmail } from "./tier-unlocked";
import { referralSuccessEmail } from "./referral-success";
import { partnerApplicationReceivedEmail } from "./partner-application-received";
import { restaurantActivatedEmail } from "./restaurant-activated";
import { onboardingReminderEmail } from "./onboarding-reminder";
import { pendingRequestsReminderEmail } from "./pending-requests-reminder";
import { catalogGapsReminderEmail } from "./catalog-gaps-reminder";
import { ownerInviteEmail } from "./owner-invite";
import { appLink, type LinkFn, type MemberTheme, type RenderedEmail, type ShortMessage } from "./kit";

export type SequenceAudience = "membre" | "restaurateur";

export type PreviewEntry = {
  id: string;
  // Séquence pilotée (ADR 0063) ou e-mail transactionnel existant.
  kind: "sequence" | "transactionnel";
  audience: SequenceAudience;
  sequence: string;
  variant?: string;
  email: RenderedEmail;
  short?: ShortMessage;
};

const link: LinkFn = appLink;
const RID = "poulet-dore";

export function previewEntries(opts: { logoUrl: string | null; image: (name: string) => string | null }): PreviewEntry[] {
  const theme: MemberTheme = {
    restaurantName: "Poulet Doré Ixelles",
    logoUrl: opts.logoUrl,
    primary: "#D8641B",
    dark: "#2E1A0C",
  };
  const img = (name: string) => opts.image(name);
  const manageUrl = link("/compte#emails");
  const stop = (key: string) => link(`/e/stop/${key}-exemple`);

  const welcomeGift = { name: "Churros (6)", imageUrl: img("Churros (6)") };
  const showcase = [
    { name: "Milkshake", points: 180, imageUrl: img("Milkshake"), caption: "≈ 1 ticket" },
    { name: "Wings (16)", points: 545, imageUrl: img("Wings (16)"), caption: "≈ 3 tickets" },
    { name: "Menu Finest", points: 1095, imageUrl: img("Menu Finest burger"), caption: "≈ 6 tickets" },
  ];

  const ft = (step: 1 | 2 | 3) =>
    firstTicketEmail({ theme, restaurantId: RID, firstName: "Léa", step, welcomeGift, showcase, link, manageUrl, stopUrl: stop("premier-ticket") });

  const teamChoices = [
    { id: "s1", label: "Athénée du Parc", emoji: "🎓", hasCaptain: true },
    { id: "s2", label: "Bureau Delta", emoji: "🏢", hasCaptain: false },
    { id: "s3", label: "Quartier Flagey", emoji: "🏘️", hasCaptain: true },
  ];

  const recapStats = [
    { label: "Tickets validés", value: "64", delta: { text: "+23 % vs sem. préc.", direction: "up" as const } },
    { label: "Nouveaux membres", value: "17", delta: { text: "+6 % vs sem. préc.", direction: "up" as const } },
    { label: "CA programme", value: "1 180 €", delta: { text: "+19 % vs sem. préc.", direction: "up" as const } },
    { label: "Panier moyen", value: "18,44 €", delta: { text: "stable", direction: "flat" as const } },
  ];

  const ideas = [
    {
      icon: "🌙",
      title: "Mardi, la 2ᵉ portion de Wings à −30 %",
      why: "Mardi est ton jour le plus calme : 31 articles vendus contre 58 en moyenne les autres jours. Sur les Wings (8), la remise garde 2,65 € de marge sur la 2ᵉ portion.",
      when: "PROMO MAR. 22 SEPT. · ANNONCE LUN. 21 AU SOIR",
      cta: { label: "Programmer l'annonce", path: `/admin/${RID}/broadcast?sendOn=2026-09-21&promoOn=2026-09-22` },
    },
    {
      icon: "🪜",
      title: "Formule dégressive sur les Tenders",
      why: "1 pour 6,50 € · 2 pour 10 € · 3 pour 12,50 €. Ton article le plus vendu à forte marge : chaque unité ajoutée garde au moins 0,50 € de marge.",
      cta: { label: "Voir le détail", path: `/admin/${RID}/insights` },
    },
    {
      icon: "🍦",
      title: "Samedi, le milkshake à 1 € avec un menu",
      why: "Samedi est ton jour le plus chargé (+40 % d'articles). Le milkshake coûte 0,80 € : proposé avec un menu, il fait monter le panier sans perte.",
      when: "PROMO SAM. 26 SEPT. · ANNONCE VEN. 25 AU SOIR",
      cta: { label: "Programmer l'annonce", path: `/admin/${RID}/broadcast?sendOn=2026-09-25&promoOn=2026-09-26` },
    },
  ];

  return [
    { id: "m-first-1", kind: "sequence", audience: "membre", sequence: "Ton premier ticket", variant: "Envoi 1 · J+2", email: ft(1), short: firstTicketShort({ theme, restaurantId: RID, welcomeGift, link }) },
    { id: "m-first-2", kind: "sequence", audience: "membre", sequence: "Ton premier ticket", variant: "Envoi 2 · J+7", email: ft(2) },
    { id: "m-first-3", kind: "sequence", audience: "membre", sequence: "Ton premier ticket", variant: "Envoi 3 · J+21, le dernier", email: ft(3) },
    {
      id: "m-team",
      kind: "sequence",
      audience: "membre",
      sequence: "Rejoins ton équipe",
      variant: "1 fois par semestre",
      email: teamInviteEmail({ theme, restaurantId: RID, firstName: "Léa", choices: teamChoices, firstTeamGift: { name: "Churros (6)", imageUrl: img("Churros (6)") }, link, manageUrl, stopUrl: stop("equipe") }),
      short: teamInviteShort({ theme, restaurantId: RID, choices: teamChoices, link }),
    },
    {
      id: "m-referral",
      kind: "sequence",
      audience: "membre",
      sequence: "Invite tes amis",
      variant: "Lendemain d'un cadeau récupéré",
      email: referralNudgeEmail({
        theme, restaurantId: RID, firstName: "Léa", redeemedGift: "Wings (16)", jetons: 2, friendsTowardNext: 3,
        jetonsGift: "Churros (12)", whatsappUrl: "https://wa.me/?text=Rejoins%20ma%20communaut%C3%A9", socialActionsLeft: 2,
        link, manageUrl, stopUrl: stop("parrainage"),
      }),
      short: referralNudgeShort({ theme, restaurantId: RID, redeemedGift: "Wings (16)", jetonsGift: "Churros (12)", link }),
    },
    {
      id: "m-install",
      kind: "sequence",
      audience: "membre",
      sequence: "Installe l'app",
      variant: "E-mail seul · J+3 après le 1er ticket",
      email: installAppEmail({
        theme, restaurantId: RID, firstName: "Léa", points: 1240,
        target: { name: "Menu Finest", imageUrl: img("Menu Finest burger"), reachable: true },
        link, manageUrl, doneUrl: stop("app-installee"),
      }),
    },
    {
      id: "r-milestone",
      kind: "sequence",
      audience: "restaurateur",
      sequence: "Cap franchi",
      variant: "Ici : 50 membres",
      email: milestoneEmail({
        restaurantName: theme.restaurantName, restaurantId: RID, logoUrl: opts.logoUrl, kind: "members", milestone: 50, current: 52,
        sinceLaunch: "En 5 semaines",
        context: [
          { label: "Tickets validés", value: "186" },
          { label: "CA programme", value: "3 420 €" },
          { label: "Actifs sur 30 j", value: "31" },
          { label: "Cadeaux réclamés", value: "24" },
        ],
        tip: {
          icon: "🪪",
          title: "Ton équipe en salle a amené 21 inscriptions",
          why: "Sarah en a amené 12 à elle seule. Un badge par prénom, et chacun peut faire pareil — tu verras qui amène qui.",
          cta: { label: "Créer les badges", path: `/admin/${RID}/qr` },
        },
        link, manageUrl: link(`/admin/${RID}/settings#emails`), stopUrl: stop("caps"),
      }),
    },
    {
      id: "r-recap",
      kind: "sequence",
      audience: "restaurateur",
      sequence: "Ta semaine",
      variant: "Chaque lundi, 8 h",
      email: weeklyRecapEmail({
        restaurantName: theme.restaurantName, restaurantId: RID, logoUrl: opts.logoUrl,
        weekLabel: "Semaine 38 · 14 – 20 sept.",
        headline: recapHeadline({ tickets: 64, ticketsPrev: 52, bestTicketsBefore: 58, newMembers: 17 }),
        tickets: 64, newMembers: 17, stats: recapStats,
        staff: [
          { label: "Sarah", hint: "6 ont déjà envoyé un ticket", value: "9 inscr.", ratio: 1 },
          { label: "Yanis", hint: "3 ont déjà envoyé un ticket", value: "5 inscr.", ratio: 5 / 9 },
          { label: "Inès", hint: "1 a déjà envoyé un ticket", value: "2 inscr.", ratio: 2 / 9 },
        ],
        teams: [
          { label: "🎓 Athénée du Parc", hint: "14 membres · 2 nouveaux", value: "+1 240 pts", ratio: 1 },
          { label: "🏢 Bureau Delta", hint: "9 membres", value: "+860 pts", ratio: 860 / 1240 },
          { label: "🏘️ Quartier Flagey", hint: "6 membres · 1 nouveau", value: "+410 pts", ratio: 410 / 1240 },
        ],
        products: [
          { name: "Frites Medium", qty: 51, unitMargin: 2.05, totalMargin: 105 },
          { name: "Menu Finest", qty: 38, unitMargin: 5.2, totalMargin: 198 },
          { name: "Wings (8)", qty: 26, unitMargin: 4.1, totalMargin: 107 },
          { name: "Milkshake", qty: 22, unitMargin: 2.9, totalMargin: 64 },
          { name: "BelTacos", qty: 12, unitMargin: null, totalMargin: null },
        ],
        recognizedPct: 84,
        ideas,
        more: [
          { label: "Opportunités", hint: "3 idées chiffrées sur tes propres ventes", path: `/admin/${RID}/insights` },
          { label: "Prévisions", hint: "Entre 3 800 € et 4 600 € attendus cette semaine", path: `/admin/${RID}/forecast` },
          { label: "Mes clients", hint: "5 habitués ne sont pas revenus depuis 3 semaines", path: `/admin/${RID}/clients` },
        ],
        link, manageUrl: link(`/admin/${RID}/settings#emails`), stopUrl: stop("recap"),
      }),
    },
    {
      id: "r-idea",
      kind: "sequence",
      audience: "restaurateur",
      sequence: "L'idée de la semaine",
      variant: "Le jeudi, si une idée tient",
      email: weeklyIdeaEmail({
        restaurantName: theme.restaurantName, restaurantId: RID, logoUrl: opts.logoUrl,
        weekLabel: "Jeudi 24 sept.",
        idea: ideas[2],
        otherIdeas: 3,
        link, manageUrl: link(`/admin/${RID}/settings#emails`), stopUrl: stop("idee"),
      }),
    },

    // ── Transactionnels existants, migrés sur le kit ────────────────────────
    { id: "t-welcome", kind: "transactionnel", audience: "membre", sequence: "Bienvenue", variant: "Compte créé", email: welcomeEmail("Léa Martin") },
    {
      id: "t-reward-ready",
      kind: "transactionnel",
      audience: "membre",
      sequence: "Cadeau qui expire",
      variant: "12 h avant l'échéance",
      email: rewardReadyEmail({ theme, restaurantId: RID, firstName: "Léa", gift: { name: "Wings (16)", imageUrl: img("Wings (16)") }, hoursRemaining: 11, paidWithPoints: true }),
    },
    {
      id: "t-team-gift",
      kind: "transactionnel",
      audience: "membre",
      sequence: "Cadeau d'équipe",
      variant: "Palier franchi",
      email: tierUnlockedEmail({ theme, restaurantId: RID, firstName: "Léa", teamName: "Athénée du Parc", teamFlag: "🎓", gift: { name: "Churros (6)", imageUrl: img("Churros (6)") } }),
    },
    {
      id: "t-referral-success",
      kind: "transactionnel",
      audience: "membre",
      sequence: "Ami inscrit",
      variant: "3ᵉ ami sur 5",
      email: referralSuccessEmail({ theme, restaurantId: RID, firstName: "Léa", conversionsCount: 3 }),
    },
    { id: "t-partner", kind: "transactionnel", audience: "restaurateur", sequence: "Candidature reçue", email: partnerApplicationReceivedEmail(theme.restaurantName, RID, opts.logoUrl) },
    { id: "t-activated", kind: "transactionnel", audience: "restaurateur", sequence: "Mise en ligne", email: restaurantActivatedEmail(theme.restaurantName, RID, opts.logoUrl) },
    { id: "t-onboarding", kind: "transactionnel", audience: "restaurateur", sequence: "Inscription inachevée", variant: "Étape 2", email: onboardingReminderEmail(theme.restaurantName, RID, 2, opts.logoUrl) },
    { id: "t-pending", kind: "transactionnel", audience: "restaurateur", sequence: "Demandes en attente", email: pendingRequestsReminderEmail(theme.restaurantName, RID, 17, 52, opts.logoUrl) },
    { id: "t-catalog", kind: "transactionnel", audience: "restaurateur", sequence: "Catalogue incomplet", email: catalogGapsReminderEmail(theme.restaurantName, RID, 4, opts.logoUrl) },
    { id: "t-invite", kind: "transactionnel", audience: "restaurateur", sequence: "Invitation restaurateur", email: ownerInviteEmail(theme.restaurantName, link("/invite/exemple"), "2026-10-02T12:00:00Z", opts.logoUrl) },
  ];
}

// Illustration par défaut : l'icône Fluent du plat (lib/food-icon). En
// production, la photo du catalogue (menu_items.image_path) passe devant.
export const defaultImage = (name: string) => foodIconUrl(name);
