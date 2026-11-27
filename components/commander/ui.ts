// Les classes partagées par les écrans de la commande en ligne (boutons, liens et champ de saisie).
// Les couleurs sont celles du restaurant, rendues lisibles par `lib/site-orders/theme.ts` (variables `--co-*`) ; les replis
// sont ceux de Boosteats, pour un morceau rendu hors de l'espace.

const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
const btn = `inline-flex min-h-[48px] items-center justify-center rounded-lg px-4 py-2 text-center text-[15px] font-semibold ${focus}`;
export const accentFill = "bg-[color:var(--co-accent,#6B7C3F)] text-[color:var(--co-on-accent,#FFFFFF)]";
export const primary = `${btn} border border-[color:var(--co-accent-edge,#6B7C3F)] ${accentFill} hover:opacity-90 active:opacity-80 disabled:cursor-not-allowed disabled:border-[#CFCDC2] disabled:bg-paper-subtle disabled:text-ink-muted disabled:opacity-100`;
export const ghost = `${btn} border border-[#8A8A80] bg-white text-ink hover:bg-paper-subtle active:bg-paper-subtle`;
const link = `inline-flex min-h-[44px] items-center rounded-lg px-3 text-[15px] underline hover:no-underline ${focus}`;
export const accentLink = `${link} font-semibold text-[color:var(--co-accent-text,#4F5C2D)]`;
export const removeLink = `${link} text-danger`;
export const stepper = `h-11 w-11 shrink-0 rounded-lg border border-[#8A8A80] bg-white text-[20px] text-ink hover:bg-paper-subtle disabled:cursor-not-allowed disabled:border-paper-border disabled:text-ink-faint ${focus}`;
export const field = `block min-h-[48px] w-full min-w-0 rounded-lg border border-[#8A8A80] bg-white px-3 py-2 text-[15px] text-ink ${focus}`;
/** L'encadré d'information de l'accueil. */
export const notice = "rounded-lg border border-paper-border bg-paper-subtle px-3.5 py-3 text-[15px] leading-snug text-ink lg:px-4";
/** Le numéro tel qu'un téléphone le compose. */
export const telHref = (phone: string): string => `tel:${phone.replace(/(?!^\+)\D/g, "")}`;
