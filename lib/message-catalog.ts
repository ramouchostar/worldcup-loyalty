// Catalogue des messages du programme (ADR 0063) — ce que la plateforme pilote
// et ce qu'elle mesure. Pur, sans accès base : la page /platform/messages, le
// journal et le futur moteur de séquences parlent de la même liste.
//
// Trois familles :
//   sequence       — les sept séquences de l'ADR 0063 §1, éteintes par défaut,
//                    allumées par établissement depuis la plateforme ;
//   transactionnel — les e-mails qui répondent à un fait (compte créé, cadeau
//                    qui expire…) : toujours actifs, jamais pilotés ;
//   notification   — push / WhatsApp / carte in-app, journalisés dans
//                    notification_log (ADR 0009, 0024, 0039).

export type MessageAudience = "member" | "restaurant";
export type MessageKind = "sequence" | "transactionnel" | "notification";

export type MessageDef = {
  key: string;
  label: string;
  audience: MessageAudience;
  kind: MessageKind;
  // Pour qui, quand — une phrase, dans les mots de la revue du 18/09.
  when: string;
  channels: string;
  // Critère de réussite mesuré sur 7 jours (séquences uniquement).
  success?: string;
};

export const MESSAGES: MessageDef[] = [
  // ── Séquences (ADR 0063 §1) ────────────────────────────────────────────────
  { key: "first_ticket", label: "Ton premier ticket", audience: "member", kind: "sequence", when: "Inscrit sans ticket validé · J+2, J+7, J+21", channels: "E-mail, push", success: "Premier ticket validé" },
  { key: "team_invite", label: "Rejoins ton équipe", audience: "member", kind: "sequence", when: "Sans équipe, ≥ 1 ticket · 1 par semestre", channels: "E-mail, push", success: "Équipe rejointe" },
  { key: "referral_nudge", label: "Invite tes amis", audience: "member", kind: "sequence", when: "Lendemain d'un cadeau récupéré", channels: "E-mail, push", success: "Ami inscrit par son lien" },
  { key: "install_app", label: "Installe l'app", audience: "member", kind: "sequence", when: "≥ 1 ticket, app jamais ouverte · J+3, J+30", channels: "E-mail", success: "App ouverte installée" },
  { key: "milestone", label: "Cap franchi", audience: "restaurant", kind: "sequence", when: "Membres, tickets ou CA programme · au passage de 18 h", channels: "E-mail", success: "Console ouverte" },
  { key: "weekly_recap", label: "Ta semaine", audience: "restaurant", kind: "sequence", when: "Lundi 8 h", channels: "E-mail", success: "Annonce programmée" },
  { key: "weekly_idea", label: "L'idée de la semaine", audience: "restaurant", kind: "sequence", when: "Jeudi 10 h, si une idée tient", channels: "E-mail", success: "Annonce programmée" },

  // ── E-mails transactionnels (toujours actifs) ────────────────────────────
  { key: "welcome", label: "Bienvenue", audience: "member", kind: "transactionnel", when: "Compte créé", channels: "E-mail" },
  { key: "reward_ready", label: "Cadeau qui expire", audience: "member", kind: "transactionnel", when: "12 h avant l'échéance", channels: "E-mail" },
  { key: "tier_unlocked", label: "Cadeau d'équipe", audience: "member", kind: "transactionnel", when: "Palier d'équipe franchi", channels: "E-mail" },
  { key: "referral_success", label: "Ami inscrit", audience: "member", kind: "transactionnel", when: "Un ami s'inscrit par son lien", channels: "E-mail" },
  { key: "order_validated", label: "Ticket validé", audience: "member", kind: "transactionnel", when: "Validation en file ou rattrapage", channels: "Push" },
  { key: "order_rejected", label: "Ticket non retenu", audience: "member", kind: "transactionnel", when: "Refus en file", channels: "Push" },
  { key: "partner_application_received", label: "Candidature reçue", audience: "restaurant", kind: "transactionnel", when: "Inscription partenaire", channels: "E-mail" },
  { key: "restaurant_activated", label: "Mise en ligne", audience: "restaurant", kind: "transactionnel", when: "Validation plateforme", channels: "E-mail" },
  { key: "onboarding_reminder", label: "Inscription inachevée", audience: "restaurant", kind: "transactionnel", when: "Bloqué 48 h à l'étape 2 ou 3", channels: "E-mail" },
  { key: "pending_requests_reminder", label: "Demandes en attente", audience: "restaurant", kind: "transactionnel", when: "> 15 demandes ou une de plus de 48 h", channels: "E-mail" },
  { key: "catalog_gaps_reminder", label: "Catalogue incomplet", audience: "restaurant", kind: "transactionnel", when: "Articles récurrents sans fiche depuis 7 j", channels: "E-mail" },
  { key: "owner_invite", label: "Invitation restaurateur", audience: "restaurant", kind: "transactionnel", when: "Lien d'invitation généré", channels: "E-mail" },
  { key: "test", label: "E-mail de test", audience: "member", kind: "transactionnel", when: "Envoyé depuis cette page", channels: "E-mail" },

  // ── Notifications (notification_log) ─────────────────────────────────────
  { key: "tier_upgrade", label: "Cadeau d'équipe — annonce", audience: "member", kind: "notification", when: "Passage de 18 h, une fois par cadeau", channels: "Push, WhatsApp, in-app" },
  { key: "member_inactive", label: "Ton équipe a besoin de toi", audience: "member", kind: "notification", when: "3 j sans ticket, équipe +500 pts", channels: "Push, WhatsApp, in-app" },
  { key: "tier_approaching", label: "Palier d'équipe proche", audience: "member", kind: "notification", when: "Équipe à moins de 10 % du palier", channels: "Push, WhatsApp, in-app" },
  { key: "birthday", label: "Anniversaire", audience: "member", kind: "notification", when: "Le jour J", channels: "Push, WhatsApp, in-app" },
  { key: "winback", label: "Réactivation", audience: "member", kind: "notification", when: "Silence ≥ 2× son rythme", channels: "Push, WhatsApp, in-app" },
  { key: "action_postpone_reminder", label: "Action reportée", audience: "member", kind: "notification", when: "7 j après un « plus tard »", channels: "Push, WhatsApp, in-app" },
  { key: "admin_service", label: "Annonce — information", audience: "member", kind: "notification", when: "Composée par le restaurateur", channels: "Push, WhatsApp, in-app" },
  { key: "admin_broadcast", label: "Annonce — offre", audience: "member", kind: "notification", when: "Composée par le restaurateur", channels: "Push, WhatsApp, in-app" },
  { key: "tier_nudge", label: "Nudge de palier (retiré)", audience: "member", kind: "notification", when: "Historique — ADR 0061", channels: "In-app" },
  { key: "advancement", label: "Avancement (retiré)", audience: "member", kind: "notification", when: "Historique — ADR 0014", channels: "Push" },
];

const BY_KEY = new Map(MESSAGES.map((m) => [m.key, m]));

export function messageDef(key: string): MessageDef | null {
  return BY_KEY.get(key) ?? null;
}

export function messageLabel(key: string): string {
  return BY_KEY.get(key)?.label ?? key;
}

export const SEQUENCES = MESSAGES.filter((m) => m.kind === "sequence");

export function isSequenceKey(key: string): boolean {
  return BY_KEY.get(key)?.kind === "sequence";
}

// ─── Lecture des chiffres (pure) ─────────────────────────────────────────────

export type SendRow = {
  message_key: string;
  channel: string;
  status: string;
  clicked_at: string | null;
  delivered_at: string | null;
};

export type SendTotals = {
  attempted: number; // toutes lignes hors témoin
  sent: number; // parties chez le fournisseur (sent + delivered + bounced + complained)
  failed: number;
  delivered: number;
  bounced: number;
  complained: number;
  clicked: number;
  holdout: number;
};

export function emptyTotals(): SendTotals {
  return { attempted: 0, sent: 0, failed: 0, delivered: 0, bounced: 0, complained: 0, clicked: 0, holdout: 0 };
}

// Le statut porte le DERNIER état connu : une ligne livrée puis cliquée reste
// « delivered » avec un clicked_at. Tout ce qui n'est ni « failed » ni
// « holdout » est bien parti chez le fournisseur.
export function addToTotals(t: SendTotals, row: SendRow): SendTotals {
  if (row.status === "holdout") return { ...t, holdout: t.holdout + 1 };
  const out = { ...t, attempted: t.attempted + 1 };
  if (row.status === "failed") return { ...out, failed: out.failed + 1 };
  out.sent += 1;
  if (row.status === "delivered" || row.delivered_at) out.delivered += 1;
  if (row.status === "bounced") out.bounced += 1;
  if (row.status === "complained") out.complained += 1;
  if (row.clicked_at) out.clicked += 1;
  return out;
}

export function totalsByKey(rows: SendRow[]): Map<string, SendTotals> {
  const map = new Map<string, SendTotals>();
  for (const r of rows) map.set(r.message_key, addToTotals(map.get(r.message_key) ?? emptyTotals(), r));
  return map;
}

// Taux en pourcentage entier, ou null quand il n'y a rien à diviser — un « 0 % »
// sur zéro envoi laisserait croire à un échec total (ADR 0051 §5).
export function rate(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.round((part / whole) * 100);
}
