// Expéditeur et adresse de réponse des e-mails (ADR 0063 §5). Pur, sans
// accès base : testable et importable partout.
//
//   EMAIL_DOMAIN    sous-domaine d'envoi vérifié chez Resend (mail.boosteats.tech)
//   EMAIL_REPLY_TO  boîte réelle, lue par l'équipe (contact@boosteats.tech)
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
