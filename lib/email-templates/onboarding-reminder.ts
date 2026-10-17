import { appLink, button, esc, eyebrow, heading, linkButton, paragraph, proShell, small, strong, type RenderedEmail } from "./kit";
import { missingSteps, type EstablishmentProgress } from "../partner-progress";

// Restaurateur — inscription arrêtée avant la carte ou le ticket (ADR 0075).
// Un seul e-mail pour tous ses établissements, deux relances au plus
// (règles : lib/onboarding-reminder-rules.ts). Deux boutons : finir, ou
// écrire à l'équipe sur WhatsApp si quelque chose bloque.

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
  step: 1 | 2;
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

  const subject =
    input.step === 1 ? "Ton compte Boosteats est presque prêt" : `Il ne manque presque rien pour lancer ${oneName ? first.name : "tes établissements"}`;
  const preheader =
    input.step === 1
      ? "Il ne nous manque plus que quelques informations de ta part."
      : "Un souci pour finir ? Écris-moi sur WhatsApp, je t'aide.";

  const intro = (b: string) =>
    input.step === 1
      ? `Ton compte Boosteats est quasiment prêt. Il ne nous manque plus que quelques informations de ta part pour lancer le programme de fidélité de ${b}.`
      : `Le programme de fidélité de ${b} n'attend plus que toi : il reste quelques minutes de configuration.`;

  const body = [
    eyebrow(input.step === 1 ? "Inscription · presque fini" : "Inscription · dernier rappel"),
    heading(input.step === 1 ? "Termine la configuration de ton compte" : "Besoin d'un coup de main pour finir ?"),
    paragraph("Bonjour,"),
    paragraph(esc(intro("{{nom}}")).replace("{{nom}}", strong(brand))),
    paragraph(lines.map((l) => `• ${esc(l)}`).join("<br />")),
    paragraph(
      input.step === 1
        ? `Clique sur ${strong("Finaliser mon inscription")} : ça prend quelques minutes.`
        : `Si quelque chose te bloque (la carte, le ticket ou autre chose), écris-moi sur WhatsApp : on finit ensemble.`
    ),
    button("Finaliser mon inscription", url, "#0C1509"),
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
    footer: { reason: `Tu reçois cet e-mail parce que l'inscription de ${oneName ? first.name : "tes établissements"} sur Boosteats n'est pas terminée. Deux rappels au plus.` },
  });

  const text = `${input.step === 1 ? "Termine la configuration de ton compte" : "Besoin d'un coup de main pour finir ?"}

Bonjour,

${intro(brand)}

${lines.map((l) => `- ${l}`).join("\n")}

Finaliser mon inscription : ${url}
Un souci ? Écris-moi sur WhatsApp : ${TEAM_WHATSAPP_URL}

${invisible}

— Mehdi, l'équipe Boosteats`;

  return { subject, preheader, html, text };
}
