import { DEFAULT_RESTAURANT_COPY_TO } from "./email-sender";

/** L'adresse qui reçoit les alertes plateforme : la boîte réelle de l'équipe, sinon la copie plateforme. */
export function platformAddress(): string {
  return (process.env.EMAIL_REPLY_TO || process.env.RESTAURANT_EMAIL_COPY_TO || DEFAULT_RESTAURANT_COPY_TO).trim();
}
