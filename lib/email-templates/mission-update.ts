import { button, esc, eyebrow, heading, paragraph, proShell, small, type RenderedEmail } from "./kit";
import { PROVIDER_BRAND_LINE } from "./provider-invite";

// Le jour J et après (ADR 0084 §5) : le compte-rendu est prêt, la livraison est arrivée, elle est
// validée, le compte-rendu est contesté. Courts : un fait, le lien, ce qu'on attend. Jamais un
// montant (le prix dépend du plan) et jamais le contenu d'un compte-rendu (c'est dans l'espace).

export type MissionUpdateKind = "report_submitted" | "delivered" | "validated" | "report_contested" | "retouch_requested" | "validation_reminder" | "auto_validated" | "cancelled" | "dispute_opened" | "dispute_resolved" | "paid_out";

export type MissionUpdateInput = {
  kind: MissionUpdateKind;
  /** « restaurant » et « provider » : les deux parties ; « platform » : l'alerte litige. */
  audience: "restaurant" | "provider" | "platform";
  restaurantName: string;
  providerName: string;
  url: string;
  /** retouch_requested : le tour demandé (1 ou 2) ; validation_reminder : le rappel (1 ou 2). */
  round?: 1 | 2;
  /** cancelled : qui annule, et la bande du barème (gratuit / la moitié / tout). */
  cancelledBy?: "restaurant" | "provider" | "platform";
  band?: "free" | "half" | "full";
  /** dispute_resolved : la décision de la plateforme et, pour un partage, la part du prestataire. */
  decision?: "pay" | "refund" | "split";
  providerPct?: number;
};

type Copy = { subject: string; preheader: string; title: string; paragraphs: string[]; cta: string; note: string };

function copyFor(i: MissionUpdateInput): Copy {
  switch (i.kind) {
    case "report_submitted":
      return {
        subject: `${i.providerName} a rempli le compte-rendu du tournage`,
        preheader: "À confirmer en un clic, ou à contester si ce n'est pas exact.",
        title: "Le compte-rendu du tournage est prêt",
        paragraphs: [`${i.providerName} a noté son heure d'arrivée, son heure de fin et ce qui a manqué. Relis-le : si c'est exact, confirme-le ; sinon dis ce qui ne l'est pas.`],
        cta: "Lire le compte-rendu",
        note: "Ce compte-rendu est la pièce de référence en cas de litige : relis-le vraiment.",
      };
    case "delivered":
      return {
        subject: `${i.providerName} a livré ta vidéo`,
        preheader: "Télécharge, regarde, puis valide.",
        title: "Ta livraison est arrivée",
        paragraphs: [`${i.providerName} t'a envoyé les liens de téléchargement. Regarde tout avant de répondre : tu as droit à deux tours de retours, et chaque tour se fait en une seule fois, avec toutes tes remarques.`],
        cta: "Voir la livraison",
        note: "Sans réponse de ta part, la livraison est validée automatiquement au bout de 7 jours (deux rappels avant).",
      };
    case "validated":
      return {
        subject: `${i.restaurantName} a validé ta livraison`,
        preheader: "Bravo : la mission est validée.",
        title: "Livraison validée",
        paragraphs: [`${i.restaurantName} a validé ta livraison. La mission est terminée ; Boosteats prépare ton versement.`],
        cta: "Voir la mission",
        note: "Merci pour ton travail.",
      };
    case "retouch_requested":
      return {
        subject: `${i.restaurantName} demande une retouche (tour ${i.round ?? 1} sur 2)`,
        preheader: "Toutes ses remarques sont dans l'espace : lis-les d'un coup.",
        title: "Une retouche est demandée",
        paragraphs: [`${i.restaurantName} a regroupé toutes ses remarques en un seul envoi, chacune classée et expliquée. Corrige-les, puis livre la nouvelle version.`, "Une retouche n'est pas une refonte : si une demande change le brief de départ, c'est une demande de modification que tu peux chiffrer ou refuser."],
        cta: "Lire les remarques",
        note: i.round === 2 ? "C'est le dernier tour de retours inclus." : "Il reste un tour de retours au restaurateur après celui-ci.",
      };
    case "validation_reminder":
      return {
        subject: i.round === 2 ? `${i.providerName} attend ta réponse : validation automatique bientôt` : `${i.providerName} attend ta réponse sur la livraison`,
        preheader: i.round === 2 ? "Sans réponse, la livraison sera validée dans 2 jours." : "Regarde la livraison, puis valide ou demande une retouche.",
        title: i.round === 2 ? "Dernier rappel : la livraison sera validée dans 2 jours" : "Ta livraison t'attend",
        paragraphs: [`${i.providerName} a livré depuis plusieurs jours. Regarde tout, puis valide ou demande une retouche (tes remarques en un seul envoi).`, i.round === 2 ? "Sans réponse de ta part, la livraison sera validée automatiquement dans 2 jours et le prestataire sera payé." : "Sans réponse, elle sera validée automatiquement au bout de 7 jours."],
        cta: "Voir la livraison",
        note: "Un compte-rendu de tournage contesté bloque la validation automatique.",
      };
    case "auto_validated":
      return {
        subject: i.audience === "provider" ? `${i.restaurantName} : livraison validée automatiquement` : `Ta livraison de ${i.providerName} a été validée automatiquement`,
        preheader: "Sept jours sans réponse, deux rappels envoyés.",
        title: "Livraison validée automatiquement",
        paragraphs: [i.audience === "provider" ? `${i.restaurantName} n'a pas répondu en 7 jours malgré deux rappels : la livraison est validée et Boosteats prépare ton versement.` : `Tu n'as pas répondu en 7 jours malgré deux rappels : la livraison de ${i.providerName} est validée et la mission est terminée.`],
        cta: "Voir la mission",
        note: "Un doute ? Écris à Boosteats.",
      };
    case "cancelled": {
      const band = i.band ?? "free";
      const by = i.cancelledBy ?? "restaurant";
      const when = band === "free" ? "plus de 7 jours avant le tournage" : band === "half" ? "entre 7 jours et 48 h avant le tournage" : "moins de 48 h avant le tournage";
      if (i.audience === "platform") {
        const share = band === "free" ? "sans frais" : band === "half" ? "la moitié est due" : "tout est dû";
        return {
          subject: `Mission annulée par ${by === "provider" ? i.providerName : by === "restaurant" ? i.restaurantName : "la plateforme"} : ${i.restaurantName}`,
          preheader: `${when} : ${share}.`,
          title: "Une mission est annulée",
          paragraphs: [`${i.restaurantName} et ${i.providerName} : mission annulée ${when} (${share}).`, "Le règlement (remboursement, versement, sanction) est à faire à la main tant que le paiement en ligne n'est pas ouvert : il t'attend sur la page Prestataires."],
          cta: "Voir la mission",
          note: "Une annulation de moins de 7 jours est visible dans « Annulations à régler ».",
        };
      }
      if (i.audience === "provider") {
        const money = by === "restaurant" ? (band === "free" ? "Aucun frais : le jour est de nouveau libre dans ton calendrier." : band === "half" ? "La moitié du tournage t'est due ; le jour est de nouveau libre." : "Tout le tournage t'est dû ; le jour est de nouveau libre.") : "Le restaurateur est remboursé ; le jour est de nouveau libre.";
        return {
          subject: by === "restaurant" ? `${i.restaurantName} annule le tournage` : `Annulation enregistrée : ${i.restaurantName}`,
          preheader: money,
          title: by === "restaurant" ? "Le tournage est annulé" : "Ton annulation est enregistrée",
          paragraphs: [by === "restaurant" ? `${i.restaurantName} a annulé ${when}.` : `Tu as annulé ${when}.`, money],
          cta: "Voir la mission",
          note: by === "provider" && band !== "free" ? "Une annulation tardive est sanctionnée : avertissement, puis visibilité réduite, puis exclusion en cas de récidive." : "Merci de ta confiance.",
        };
      }
      const money = by === "provider" ? "Tu es remboursé en entier." : band === "free" ? "Aucun frais : tu es remboursé en entier." : band === "half" ? "La moitié du tournage est due ; le reste t'est rendu." : "Tout le tournage est dû.";
      return {
        subject: by === "provider" ? `${i.providerName} ne peut plus venir` : `Annulation enregistrée : ${i.providerName}`,
        preheader: money,
        title: by === "provider" ? "Le prestataire ne peut plus venir" : "Ton annulation est enregistrée",
        paragraphs: [by === "provider" ? `${i.providerName} a annulé ${when}.` : `Tu as annulé ${when}.`, money, by === "provider" ? "Tu peux faire un nouveau brief : tes réponses ne sont pas perdues." : "Boosteats règle les montants avec toi."],
        cta: "Voir la mission",
        note: "Un tournage annulé à moins de 48 h est dû en entier.",
      };
    }
    case "dispute_opened":
      return {
        subject: i.audience === "provider" ? `Médiation ouverte : ${i.restaurantName}` : `Médiation ouverte avec ${i.providerName}`,
        preheader: "Boosteats examine le dossier. Rien n'est automatique en attendant.",
        title: "Boosteats examine votre mission",
        paragraphs: [`Une médiation est ouverte sur la mission entre ${i.restaurantName} et ${i.providerName}. Boosteats lit le brief, le devis, le compte-rendu et les livraisons, puis prend contact avec chacun.`, "Pendant ce temps, aucun rappel, aucune validation et aucun versement ne se déclenche tout seul."],
        cta: "Voir la mission",
        note: "Tu n'as rien à faire : réponds simplement si Boosteats te contacte.",
      };
    case "dispute_resolved": {
      const d = i.decision ?? "pay";
      const pct = i.providerPct ?? 0;
      const restaurant = d === "pay" ? "Après examen, la livraison est jugée conforme au brief : elle est validée et la mission est terminée." : d === "refund" ? "Après examen, tu es remboursé en entier." : `Après examen, le prestataire reçoit ${pct} % de ce qu'il aurait reçu ; le reste t'est rendu.`;
      const provider = d === "pay" ? "Après examen, ta livraison est jugée conforme : elle est validée et Boosteats prépare ton versement." : d === "refund" ? "Après examen, le restaurateur est remboursé en entier. Aucun versement n'est dû pour cette mission." : `Après examen, tu reçois ${pct} % de ce que tu aurais reçu pour cette mission.`;
      return {
        subject: `Médiation terminée : ${i.audience === "provider" ? i.restaurantName : i.providerName}`,
        preheader: i.audience === "provider" ? provider : restaurant,
        title: "La médiation est terminée",
        paragraphs: [i.audience === "provider" ? provider : restaurant, "La décision est définitive. Boosteats règle les montants avec chacun."],
        cta: "Voir la mission",
        note: "Une question sur la décision ? Réponds à cet e-mail.",
      };
    }
    case "paid_out":
      return {
        subject: `Ton versement pour ${i.restaurantName} est parti`,
        preheader: "La mission est terminée et payée.",
        title: "Tu as été payé",
        paragraphs: [`Boosteats a versé ton paiement pour la mission chez ${i.restaurantName}. Selon ta banque, il apparaît sous un à trois jours ouvrés.`],
        cta: "Voir la mission",
        note: "Merci pour ton travail.",
      };
    case "report_contested":
      return {
        subject: `Compte-rendu contesté : ${i.restaurantName}`,
        preheader: `${i.restaurantName} et ${i.providerName} ne sont pas d'accord sur le compte-rendu.`,
        title: "Un compte-rendu est contesté",
        paragraphs: [`${i.restaurantName} conteste le compte-rendu de ${i.providerName}. Lis les deux versions et appelle les deux parties avant que la mission ne soit validée.`],
        cta: "Voir la mission",
        note: "Aucune validation ni aucun versement n'est automatique tant que le compte-rendu est contesté.",
      };
  }
}

export function missionUpdateEmail(i: MissionUpdateInput): RenderedEmail {
  const c = copyFor(i);
  const body = [eyebrow("Mise à jour"), heading(c.title), ...c.paragraphs.map((p) => paragraph(esc(p))), button(c.cta, i.url, "#0C1509"), small(esc(c.note))];
  const html = proShell({
    restaurantName: i.audience === "restaurant" ? i.restaurantName : "Boosteats",
    logoUrl: null,
    kicker: "Ta mission",
    subject: c.subject,
    preheader: c.preheader,
    body: body.join("\n"),
    footer: { reason: i.audience === "platform" ? "Tu reçois cette alerte en tant que plateforme Boosteats." : "Tu reçois cet e-mail parce qu'une mission est en cours sur Boosteats." },
    ...(i.audience === "provider" ? { brandLine: PROVIDER_BRAND_LINE } : {}),
  });
  const text = `${c.title}\n\n${c.paragraphs.join("\n\n")}\n\n${c.cta} : ${i.url}\n\n${c.note}`;
  return { subject: c.subject, preheader: c.preheader, html, text };
}
