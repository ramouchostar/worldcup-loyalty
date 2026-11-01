import { appLink, button, esc, eyebrow, heading, linkButton, paragraph, proShell, small, strong, type RenderedEmail } from "./kit";
import { missingSteps, type EstablishmentProgress } from "../partner-progress";

// Restaurateur — inscription arrêtée avant la carte ou le ticket (ADR 0075).
// Un seul e-mail pour tous ses établissements ; J+2, J+7, J+14 puis toutes les
// deux semaines, six au plus (règles : lib/onboarding-reminder-rules.ts). Deux
// boutons : finir, ou écrire à l'équipe sur WhatsApp si quelque chose bloque.
// Carte manquante : on dit qu'une estimation du prix de revient suffit (Krusty
// bloqué des semaines sur ses coûts, constaté le 2026-11-01), arrondie vers le
// haut en cas de doute — un coût surestimé rend les cadeaux plus prudents,
// jamais plus chers pour le restaurant (ADR 0017).

// WhatsApp de l'équipe Boosteats (Mehdi) — jamais celui d'un restaurant.
export const TEAM_WHATSAPP_URL = "https://wa.me/qr/JOTKDLJ4QGQ2G1";

// /login?as=resto : connecté, il file vers sa console (qui renvoie vers la
// page d'avancement) ; déconnecté, il voit la connexion restaurateur. Jamais
// /become-a-partner/* direct : déconnecté, le middleware l'enverrait sur
// l'INSCRIPTION (compte en double).
const FINISH_PATH = "/login?as=resto";

const STEP_LABEL = { menu: "ta carte", ticket: "un ticket exemple" } as const;

function establishmentLine(e: Pick<EstablishmentProgress, "name" | "sector" | "hasMenu" | "hasTicket">, withSector: boolean): string {
  const name = withSector && e.sector ? `${e.name} (${e.sector})` : e.name;
  const missing = missingSteps(e).map((s) => STEP_LABEL[s]).join(" et ");
  return `${name} : il manque ${missing}`;
}

export function onboardingReminderEmail(input: {
  establishments: Pick<EstablishmentProgress, "name" | "sector" | "hasMenu" | "hasTicket">[];
  /** Numéro de la relance (1 = la première). */
  step: number;
  /** Dernière relance par e-mail (la 6e). */
  last?: boolean;
  logoUrl?: string | null;
}): RenderedEmail {
  const list = input.establishments;
  const first = list[0];
  // Deux établissements du même nom (Krusty Anderlecht et Koekelberg) : la
  // commune les distingue.
  const withSector = new Set(list.map((e) => e.name)).size < list.length;
  const lines = list.map((e) => establishmentLine(e, withSector));
  // Un seul nom (un établissement, ou une enseigne à plusieurs adresses) :
  // on le nomme ; sinon « tes N établissements ».
  const oneName = new Set(list.map((e) => e.name)).size === 1;
  const brand = oneName ? first.name : `tes ${list.length} établissements`;
  const invisible =
    list.length === 1
      ? "Tant que l'inscription n'est pas terminée, ton établissement reste invisible pour tes clients."
      : "Tant que l'inscription n'est pas terminée, tes établissements restent invisibles pour tes clients.";
  const url = appLink(FINISH_PATH);
  const first1 = input.step === 1;
  const menuMissing = list.some((e) => missingSteps(e).includes("menu"));
  const finishLabel = menuMissing && !first1 ? "Terminer ma carte" : "Finaliser mon inscription";
  const costLines = [
    "Pour ta carte, tu n'as pas besoin de tes prix de revient au centime près : un ordre de grandeur suffit (« ce burger me coûte environ 3 € »). Tu pourras les corriger quand tu veux dans Menu & coûts.",
    "En cas de doute, arrondis vers le haut : tes cadeaux restent prudents et ne te coûteront jamais plus que prévu.",
  ];
  const costPrivacy = "Tes prix de revient ne sont jamais montrés à tes clients : ils servent seulement à calculer des cadeaux qui restent rentables pour toi.";

  const name = oneName ? first.name : "tes établissements";
  const subject = first1
    ? "Ton compte Boosteats est presque prêt"
    : menuMissing
      ? `${oneName ? `${first.name} — ta` : "Ta"} carte, sans chercher le centime`
      : `Il ne manque presque rien pour lancer ${name}`;
  const preheader = first1
    ? "Il ne nous manque plus que quelques informations de ta part."
    : menuMissing
      ? "Une estimation suffit pour tes prix de revient."
      : "Un souci pour finir ? Écris-moi sur WhatsApp, je t'aide.";
  const title = first1
    ? "Termine la configuration de ton compte"
    : menuMissing
      ? "Une estimation suffit pour tes prix de revient"
      : "Besoin d'un coup de main pour finir ?";

  const intro = (b: string) =>
    first1
      ? `Ton compte Boosteats est quasiment prêt. Il ne nous manque plus que quelques informations de ta part pour lancer le programme de fidélité de ${b}.`
      : `Le programme de fidélité de ${b} n'attend plus que toi : il reste quelques minutes de configuration.`;
  const help = first1
    ? `Clique sur « ${finishLabel} » : ça prend quelques minutes.`
    : "Si quelque chose te bloque (la carte, le ticket ou autre chose), écris-moi sur WhatsApp : on finit ensemble.";

  const body = [
    eyebrow(first1 ? "Inscription · presque fini" : input.last ? "Inscription · dernier rappel" : "Inscription · rappel"),
    heading(title),
    paragraph("Bonjour,"),
    paragraph(esc(intro("{{nom}}")).replace("{{nom}}", strong(brand))),
    paragraph(lines.map((l) => `• ${esc(l)}`).join("<br />")),
    ...(menuMissing ? [...costLines.map((l) => paragraph(esc(l))), small(esc(costPrivacy))] : []),
    paragraph(first1 ? `Clique sur ${strong(finishLabel)} : ça prend quelques minutes.` : esc(help)),
    button(finishLabel, url, "#0C1509"),
    linkButton("Un souci ? Écris-moi sur WhatsApp", TEAM_WHATSAPP_URL),
    small(esc(invisible)),
    paragraph(`— Mehdi, l'équipe Boosteats`),
  ];

  const html = proShell({
    restaurantName: oneName ? first.name : "Boosteats",
    logoUrl: list.length === 1 ? input.logoUrl ?? null : null,
    kicker: "Inscription",
    subject,
    preheader,
    body: body.join("\n"),
    footer: {
      reason: `Tu reçois cet e-mail parce que l'inscription de ${name} sur Boosteats n'est pas terminée. ${input.last ? "C'est le dernier rappel par e-mail." : "Un rappel toutes les deux semaines au plus, six en tout."}`,
    },
  });

  const text = `${title}

Bonjour,

${intro(brand)}

${lines.map((l) => `- ${l}`).join("\n")}
${menuMissing ? `\n${costLines.join("\n\n")}\n\n${costPrivacy}\n` : ""}
${help}

${finishLabel} : ${url}
Un souci ? Écris-moi sur WhatsApp : ${TEAM_WHATSAPP_URL}

${invisible}

— Mehdi, l'équipe Boosteats`;

  return { subject, preheader, html, text };
}
