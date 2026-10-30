import { createAdminClient } from "./supabase";
import { dispatch, getRestaurantLogoUrl } from "./email";
import { listLiveRestaurants } from "./demo";
import { getRestaurantContactEmail } from "./missions-contact";
import { proAnnouncementEmail } from "./email-templates/pro-announcement";

// Annonce aux restaurateurs depuis /platform/messages : un e-mail par établissement
// choisi, au propriétaire, par `dispatch` (journalisé, ADR 0063). Seuls les
// établissements réels et actifs sont joignables (ADR 0033). Un même objet déjà
// parti vers un établissement dans les 24 h n'est pas renvoyé (double clic,
// page rechargée) : le résultat le dit.

export type AnnouncementInput = {
  restaurantIds: string[];
  subject: string;
  title: string;
  body: string;
  buttonLabel?: string | null;
  path?: string | null;
};

export type AnnouncementOutcome = { restaurantId: string; name: string; status: "sent" | "failed" | "no_contact" | "already_sent"; to?: string };

export function judgeAnnouncement(i: AnnouncementInput): string | null {
  if (!i.restaurantIds.length) return "Choisis au moins un établissement.";
  if (i.subject.trim().length < 5 || i.subject.length > 140) return "L'objet doit faire entre 5 et 140 caractères.";
  if (i.title.trim().length < 3 || i.title.length > 120) return "Le titre doit faire entre 3 et 120 caractères.";
  if (i.body.trim().length < 20 || i.body.length > 5000) return "Le texte doit faire entre 20 et 5 000 caractères.";
  return null;
}

async function liveTargets(ids: string[]): Promise<{ id: string; name: string }[]> {
  const live = await listLiveRestaurants<{ id: string; name: string }>(createAdminClient(), "id, name");
  return live.filter((r) => ids.includes(r.id));
}

async function render(i: AnnouncementInput, r: { id: string; name: string }) {
  return proAnnouncementEmail({
    restaurantName: r.name,
    restaurantId: r.id,
    logoUrl: await getRestaurantLogoUrl(r.id),
    subject: i.subject.trim(),
    title: i.title.trim(),
    body: i.body,
    buttonLabel: i.buttonLabel,
    path: i.path,
  });
}

/** Aperçu : l'e-mail du premier établissement choisi, vers le super-admin qui clique. */
export async function sendAnnouncementPreview(i: AnnouncementInput, to: string, userId: string): Promise<boolean> {
  const [r] = await liveTargets(i.restaurantIds);
  if (!r) return false;
  const email = await render(i, r);
  return dispatch(to, { ...email, subject: `[Aperçu] ${email.subject}` }, { key: "test", audience: "restaurant", userId });
}

async function alreadySent(restaurantId: string, subject: string): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data, error } = await createAdminClient()
    .from("message_sends")
    .select("id")
    .eq("message_key", "pro_announcement")
    .eq("restaurant_id", restaurantId)
    .eq("subject", subject)
    .neq("status", "failed")
    .gte("created_at", since)
    .limit(1);
  return !error && (data ?? []).length > 0;
}

export async function sendAnnouncement(i: AnnouncementInput): Promise<AnnouncementOutcome[]> {
  const out: AnnouncementOutcome[] = [];
  for (const r of await liveTargets(i.restaurantIds)) {
    const email = await render(i, r);
    if (await alreadySent(r.id, email.subject)) {
      out.push({ restaurantId: r.id, name: r.name, status: "already_sent" });
      continue;
    }
    const to = await getRestaurantContactEmail(r.id, null);
    if (!to) {
      out.push({ restaurantId: r.id, name: r.name, status: "no_contact" });
      continue;
    }
    const ok = await dispatch(to, email, { key: "pro_announcement", audience: "restaurant", restaurantId: r.id, restaurantName: r.name });
    out.push({ restaurantId: r.id, name: r.name, status: ok ? "sent" : "failed", to });
  }
  return out;
}
