// Expéditeur et adresse de réponse des e-mails (ADR 0063 §5). Pur, sans
// accès base : testable et importable partout.
//
//   EMAIL_DOMAIN    domaine d'envoi vérifié chez Resend (boosteats.be)
//   EMAIL_REPLY_TO  boîte réelle, lue par l'équipe (contact@boosteats.be)
//   EMAIL_FROM      repli historique tant que le domaine n'est pas configuré
//
// Membre : le nom de SON établissement comme expéditeur — c'est lui qu'il
// reconnaît dans sa boîte. Restaurateur : Boosteats. Les réponses vont
// toujours à la plateforme, jamais au restaurant : la réponse d'un membre
// donnerait son adresse au restaurateur (ADR 0025).

export type SenderKind = "member" | "restaurant";

export type SenderConfig = { domain?: string | null; replyTo?: string | null; fallbackFrom?: string | null };

const DEFAULT_FROM = "Boosteats <onboarding@resend.dev>";

// Nom affiché : sans guillemets, chevrons ni retours à la ligne (ils
// casseraient l'en-tête From), 60 caractères au plus.
export function senderDisplayName(name: string | null | undefined): string {
  const clean = (name ?? "").replace(/[\r\n]+/g, " ").replace(/["<>\\]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
  return clean || "Boosteats";
}

export function senderAddress(kind: SenderKind, restaurantName: string | null, config: SenderConfig): string {
  const domain = config.domain?.trim();
  if (!domain) return config.fallbackFrom?.trim() || DEFAULT_FROM;
  return kind === "member"
    ? `"${senderDisplayName(restaurantName)}" <bonjour@${domain}>`
    : `Boosteats <equipe@${domain}>`;
}

export function replyToAddress(config: SenderConfig): string | undefined {
  return config.replyTo?.trim() || undefined;
}

export function senderConfigFromEnv(): SenderConfig {
  return {
    domain: process.env.EMAIL_DOMAIN ?? null,
    replyTo: process.env.EMAIL_REPLY_TO ?? null,
    fallbackFrom: process.env.EMAIL_FROM ?? null,
  };
}

// Copie plateforme : chaque e-mail parti chez un restaurateur part aussi,
// à l'identique, vers la boîte Boosteats — pour voir exactement ce qu'il
// reçoit. RESTAURANT_EMAIL_COPY_TO change l'adresse ; vide, plus de copie.
// Jamais d'e-mail membre (ADR 0025), jamais l'e-mail de test, jamais une
// copie de ce qu'on s'envoie déjà à soi-même.
export const DEFAULT_RESTAURANT_COPY_TO = "boosteats1@gmail.com";

export function restaurantCopyAddress(
  to: string,
  kind: SenderKind,
  messageKey: string,
  configured: string | null | undefined
): string | null {
  if (kind !== "restaurant" || messageKey === "test") return null;
  const copy = (configured ?? DEFAULT_RESTAURANT_COPY_TO).trim();
  if (!copy || copy.toLowerCase() === to.trim().toLowerCase()) return null;
  return copy;
}

// Objet de la copie : le même, précédé du destinataire réel — sinon dix
// restaurateurs donnent dix e-mails indiscernables.
export function restaurantCopySubject(subject: string, to: string): string {
  return `[Copie → ${to.trim()}] ${subject}`;
}
