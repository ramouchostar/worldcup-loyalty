import { brusselsInstant } from "./mission-cancellation";
import { shootSlots } from "./mission-brief";
import { buildIcs } from "./mission-reminders";
import { dateLabelFr } from "./mission-team-message";

// ADR 0084 §5 — le fichier calendrier d'un tournage, pour le restaurateur et pour le prestataire.
// Le créneau (début et fin) vient des créneaux conseillés ; une alarme prévient deux jours avant.

export type IcsMission = {
  id: string;
  shoot_date: string | null;
  shoot_start: string | null;
  brief: Record<string, unknown> | null;
};

export function missionIcs(m: IcsMission, opts: { forWho: "restaurant" | "provider"; restaurantName: string; providerName: string; now?: Date }): string | null {
  if (!m.shoot_date || !m.shoot_start) return null;
  const slot = shootSlots(m.shoot_date).find((s) => s.start === m.shoot_start);
  const start = brusselsInstant(m.shoot_date, m.shoot_start);
  // Un créneau inconnu (ne devrait pas arriver) : deux heures, la durée d'un petit tournage.
  const end = slot ? brusselsInstant(m.shoot_date, slot.end) : new Date(start.getTime() + 2 * 3_600_000);

  const a = m.brief ?? {};
  const contact = (a.contact as { name?: string; phone?: string } | undefined) ?? {};
  const roles = Array.isArray(a.roles) ? (a.roles as string[]) : [];
  const lines = [
    `Tournage ${dateLabelFr(m.shoot_date)} à ${m.shoot_start}`,
    `Contact sur place : ${[contact.name, contact.phone].filter(Boolean).join(" · ") || "à confirmer"}`,
    ...(roles.length ? [`Présents : ${roles.join(", ").toLowerCase()}`] : []),
    ...(typeof a.access === "string" && a.access ? [`Accès : ${a.access}`] : []),
    "Un tournage annulé à moins de 48 h est dû en entier.",
  ];
  return buildIcs({
    uid: `${m.id}-${opts.forWho}`,
    summary: opts.forWho === "restaurant" ? `Tournage avec ${opts.providerName}` : `Tournage chez ${opts.restaurantName}`,
    start,
    end,
    description: lines.join("\n"),
    alarmDaysBefore: 2,
    now: opts.now,
  });
}

export function icsResponse(body: string, id: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="tournage-${id.slice(0, 8)}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
