// ADR 0075 §3-4 — où en est l'inscription d'un établissement. « Fait » se lit
// dans les données, jamais déclaré : carte = au moins un article actif ;
// ticket = restaurant_receipt_config.confirmed_at renseigné (« Je n'ai pas de
// numéro fiable » compte, c'est une réponse). Même critère que la relance
// d'onboarding (app/api/cron/notifications). Module pur, testé.

export type EstablishmentProgress = {
  id: string;
  name: string;
  sector: string | null;
  status: string;
  hasMenu: boolean;
  hasTicket: boolean;
};

export type StepState = "done" | "todo" | "wait";

export type MissingStep = "menu" | "ticket";

/** Ce qui manque à un établissement pour être validé. */
export function missingSteps(e: Pick<EstablishmentProgress, "hasMenu" | "hasTicket">): MissingStep[] {
  const out: MissingStep[] = [];
  if (!e.hasMenu) out.push("menu");
  if (!e.hasTicket) out.push("ticket");
  return out;
}

/** Un établissement en attente sans sa carte ou son ticket : console fermée, validation refusée. */
export function isIncomplete(e: EstablishmentProgress): boolean {
  return e.status === "pending" && missingSteps(e).length > 0;
}

export const MISSING_LABEL: Record<MissingStep, string> = {
  menu: "carte manquante",
  ticket: "ticket manquant",
};

/**
 * La ligne d'étapes de la page d'avancement, sur l'ensemble des établissements
 * du restaurateur : une étape n'est faite que si elle l'est pour tous.
 */
export function progressTrack(list: EstablishmentProgress[]): { key: string; label: string; state: StepState }[] {
  const pending = list.filter((e) => e.status === "pending");
  const menuDone = pending.every((e) => e.hasMenu);
  const ticketDone = pending.every((e) => e.hasTicket);
  const allLive = list.length > 0 && list.every((e) => e.status === "active");
  return [
    { key: "etablissements", label: "Établissements", state: "done" },
    { key: "compte", label: "Compte", state: "done" },
    { key: "carte", label: "Carte", state: menuDone ? "done" : "todo" },
    { key: "ticket", label: "Ticket", state: ticketDone ? "done" : "todo" },
    { key: "validation", label: "Validation", state: allLive ? "done" : "wait" },
  ];
}

/** Les établissements à qui il manque cette étape, dans l'ordre d'inscription. */
export function missingFor(list: EstablishmentProgress[], step: MissingStep): EstablishmentProgress[] {
  return list.filter((e) => e.status === "pending" && missingSteps(e).includes(step));
}
