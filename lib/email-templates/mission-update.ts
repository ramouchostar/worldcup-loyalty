import { button, esc, eyebrow, heading, paragraph, proShell, small, type RenderedEmail } from "./kit";
import { getT, type Locale } from "../i18n";
import { providerCopy } from "./mission-update-provider";
import { restaurantCopy } from "./mission-update-restaurant";

// Le jour J et après (ADR 0084 §5) : le compte-rendu est prêt, la livraison est arrivée, elle est
// validée, le compte-rendu est contesté. Courts : un fait, le lien, ce qu'on attend. Jamais un
// montant (le prix dépend du plan) et jamais le contenu d'un compte-rendu (c'est dans l'espace).

export type MissionUpdateKind = "report_submitted" | "delivered" | "validated" | "report_contested" | "retouch_requested" | "validation_reminder" | "auto_validated" | "cancelled" | "dispute_opened" | "dispute_resolved" | "paid_out" | "proposals_received" | "proposals_again" | "proposal_chosen" | "proposal_auto" | "proposals_due" | "proposals_choose" | "proposals_missing" | "work_started" | "studio_start" | "studio_start_late" | "studio_deliver" | "studio_overdue" | "bat_review" | "bat_review_again" | "bat_corrections_due" | "message_received" | "bat_submitted" | "bat_corrections" | "bat_signed" | "change_requested" | "change_quoted" | "change_provider_declined" | "change_accepted" | "change_restaurant_declined" | "change_withdrawn" | "change_expired";

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
  band?: "free" | "half" | "full" | "deposit";
  /** Métier d'atelier (design, impression) : pas de date de tournage, l'annulation parle du début du travail. */
  studio?: boolean;
  /** dispute_resolved : la décision de la plateforme et, pour un partage, la part du prestataire. */
  decision?: "pay" | "refund" | "split";
  providerPct?: number;
  /** Propositions créatives : le titre retenu, le nombre d'idées, le dernier jour pour agir (« jeudi 22 octobre »), et pourquoi elle est retenue d'office. */
  title?: string;
  count?: number;
  deadlineLabel?: string;
  auto?: "auto" | "fallback";
  /** Modifications : le prestataire propose « sans supplément ». */
  free?: boolean;
  /** Le jour limite en ISO (« 2026-10-22 ») : il est dit dans la langue du destinataire ; sans lui, `deadlineLabel` (français) est repris tel quel. */
  deadlineDay?: string;
  /** La langue du destinataire, prestataire ou restaurateur (français par défaut). Les e-mails de la plateforme restent en français. */
  locale?: Locale;
  /** Impression : la livraison est un objet (livré ou prêt au retrait), pas des liens à télécharger ni des retouches à demander. */
  print?: boolean;
};

type Copy = { subject: string; preheader: string; title: string; paragraphs: string[]; cta: string; note: string };

export function copyFor(i: MissionUpdateInput): Copy {
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
      if (i.print) {
        return {
          subject: `${i.providerName} a livré ton impression`,
          preheader: "Vérifie-la, puis confirme que tu l'as bien reçue.",
          title: "Ton impression est prête",
          paragraphs: [`${i.providerName} indique que ton impression est livrée ou prête au retrait. Regarde-la, puis confirme la réception dans l'espace.`, "Elle doit correspondre au bon à tirer que tu as signé. Si ce n'est pas le cas, écris-nous : Boosteats examine l'épreuve signée et l'impression."],
          cta: "Confirmer la réception",
          note: "Sans réponse de ta part, la réception est confirmée automatiquement au bout de 7 jours (deux rappels avant).",
        };
      }
      return {
        subject: `${i.providerName} a livré ton travail`,
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
    case "studio_start":
      return {
        subject: `${i.restaurantName} attend que tu commences`,
        preheader: i.deadlineLabel ? `Livraison souhaitée : ${i.deadlineLabel}.` : "Touche « Je commence » quand tu démarres.",
        title: "Tu n'as pas encore commencé",
        paragraphs: [`Le devis de ${i.restaurantName} est accepté${i.deadlineLabel ? ` et il souhaite son travail pour ${i.deadlineLabel}` : ""}. Touche « Je commence » dès que tu démarres : tant que tu ne l'as pas fait, il peut encore annuler sans frais.`, "Si tu ne peux pas tenir ce jour, dis-le-lui dans la messagerie plutôt que de te taire."],
        cta: "Ouvrir la mission",
        note: "Un rappel ne change rien à ta mission : il te prévient, c'est tout.",
      };
    case "studio_start_late":
      return {
        subject: `Pas encore commencé : ${i.providerName} chez ${i.restaurantName}`,
        preheader: i.deadlineLabel ? `Livraison souhaitée : ${i.deadlineLabel}.` : "Le jour souhaité approche.",
        title: "Le travail n'a pas commencé",
        paragraphs: [`${i.providerName} n'a toujours pas commencé le travail de ${i.restaurantName}${i.deadlineLabel ? `, attendu pour ${i.deadlineLabel}` : ""}. Appelle le prestataire : s'il ne peut pas tenir le jour, le restaurateur doit le savoir avant, pas après.`],
        cta: "Voir la mission",
        note: "Rien n'est annulé ni sanctionné automatiquement : c'est à toi de décider.",
      };
    case "studio_deliver":
      return {
        subject: `${i.restaurantName} attend ta livraison`,
        preheader: i.deadlineLabel ? `Livraison souhaitée : ${i.deadlineLabel}.` : "La livraison souhaitée approche.",
        title: "La livraison souhaitée approche",
        paragraphs: [`${i.restaurantName} souhaite son travail pour ${i.deadlineLabel ?? "bientôt"}. Si tu es dans les temps, tu n'as rien à faire de plus que livrer ; sinon, préviens-le dans la messagerie.`],
        cta: "Ouvrir la mission",
        note: "Un rappel ne change rien à ta mission.",
      };
    case "studio_overdue":
      return i.audience === "platform"
        ? {
            subject: `Jour souhaité dépassé : ${i.providerName} chez ${i.restaurantName}`,
            preheader: "Le travail n'est pas livré et le jour souhaité est passé.",
            title: "Un travail est en retard",
            paragraphs: [`${i.providerName} n'a pas livré le travail de ${i.restaurantName}${i.deadlineLabel ? ` attendu pour ${i.deadlineLabel}` : ""}. Appelle les deux parties : un retard sans nouvelle est la première cause de désaccord.`],
            cta: "Voir la mission",
            note: "Rien n'est sanctionné automatiquement : le jour souhaité n'est pas un engagement, le délai du devis fait foi.",
          }
        : {
            subject: `Le jour souhaité par ${i.restaurantName} est passé`,
            preheader: "Dis-lui où tu en es.",
            title: "Ta livraison est en retard",
            paragraphs: [`${i.restaurantName} attendait son travail${i.deadlineLabel ? ` pour ${i.deadlineLabel}` : ""}. Livre dès que possible, ou dis-lui dans la messagerie quand ce sera prêt : un retard annoncé se règle, un retard silencieux se transforme en litige.`],
            cta: "Ouvrir la mission",
            note: "Le délai de ton devis fait foi ; le jour souhaité ne t'engage pas.",
          };
    case "bat_review":
    case "bat_review_again":
      return {
        subject: i.kind === "bat_review" ? `Ton bon à tirer t'attend` : `Ton bon à tirer attend toujours ta réponse`,
        preheader: "Signe-le ou demande des corrections : rien n'est imprimé sans toi.",
        title: i.kind === "bat_review" ? "Ton épreuve attend ta réponse" : "Ton épreuve n'a toujours pas de réponse",
        paragraphs: [`${i.providerName} t'a envoyé l'épreuve de ton impression et attend ta réponse pour imprimer. Vérifie-la point par point, puis signe-la ou demande des corrections.`, "Rien ne sera imprimé tant que tu n'as pas signé, et rien ne se signe tout seul."],
        cta: "Voir l'épreuve",
        note: "Une fois signée, c'est exactement ce qui sera imprimé : prends le temps de bien vérifier.",
      };
    case "bat_corrections_due":
      return {
        subject: `${i.restaurantName} attend ton épreuve corrigée`,
        preheader: "Ses corrections sont dans l'espace.",
        title: "Des corrections t'attendent",
        paragraphs: [`${i.restaurantName} t'a envoyé ses corrections sur l'épreuve et attend la nouvelle version pour signer. Corrige-les, puis envoie une nouvelle épreuve.`],
        cta: "Lire les corrections",
        note: "Après la troisième épreuve, il ne reste qu'à signer.",
      };
    case "message_received":
      return {
        subject: i.audience === "provider" ? `${i.restaurantName} t'a écrit` : `${i.providerName} t'a écrit`,
        preheader: "Un message t'attend dans la mission.",
        title: "Tu as un nouveau message",
        paragraphs: [i.audience === "provider" ? `${i.restaurantName} t'a écrit dans votre mission. Lis-le et réponds depuis l'espace : tout est gardé au même endroit.` : `${i.providerName} t'a écrit dans votre mission. Lis-le et réponds depuis l'espace : tout est gardé au même endroit.`],
        cta: "Lire le message",
        note: "Tu ne recevras pas d'autre e-mail tant que tu n'as pas lu celui-ci, et au plus un toutes les 30 minutes.",
      };
    case "bat_submitted":
      return {
        subject: `${i.providerName} t'envoie ${(i.count ?? 1) > 1 ? "une nouvelle épreuve" : "ton bon à tirer"}`,
        preheader: "Vérifie chaque point, puis signe ou demande des corrections.",
        title: (i.count ?? 1) > 1 ? "Une nouvelle épreuve t'attend" : "Ton bon à tirer t'attend",
        paragraphs: [`${i.providerName} a préparé ${(i.count ?? 1) > 1 ? "l'épreuve corrigée" : "l'épreuve de ton impression"}. Regarde-la attentivement : une fois signée, c'est exactement ce qui sera imprimé.`, "Tu peux la signer, ou demander des corrections (deux tours au total, chacun en un seul envoi)."],
        cta: "Voir l'épreuve",
        note: "Une erreur visible sur un bon à tirer signé n'est pas réimprimée gratuitement.",
      };
    case "bat_corrections":
      return {
        subject: `${i.restaurantName} demande ${i.count ?? 1} correction${(i.count ?? 1) > 1 ? "s" : ""} sur le bon à tirer`,
        preheader: "Toutes ses corrections sont dans l'espace : lis-les d'un coup.",
        title: "Des corrections sont demandées",
        paragraphs: [`${i.restaurantName} a regroupé ses corrections en un seul envoi, chacune classée et expliquée. Corrige-les, puis envoie une nouvelle épreuve.`],
        cta: "Lire les corrections",
        note: "Après la troisième épreuve, il ne reste qu'à signer.",
      };
    case "bat_signed":
      return i.audience === "platform"
        ? {
            subject: `Bon à tirer signé : ${i.providerName} chez ${i.restaurantName}`,
            preheader: "Le solde est dû à la signature : à encaisser à la main tant que le paiement en ligne n'est pas ouvert.",
            title: "Un bon à tirer est signé",
            paragraphs: [`${i.restaurantName} a signé le bon à tirer de ${i.providerName}. L'impression est lancée et la mission n'est plus annulable. Le solde est dû ; il se règle à la main tant que le paiement en ligne n'est pas ouvert.`],
            cta: "Voir la mission",
            note: "Le nom signé et les points cochés sont dans la trace de la mission.",
          }
        : {
            subject: `${i.restaurantName} a signé le bon à tirer`,
            preheader: "Tu peux imprimer.",
            title: "Le bon à tirer est signé : lance l'impression",
            paragraphs: [`${i.restaurantName} a signé l'épreuve. Tu peux imprimer : ce que tu imprimes doit correspondre à l'épreuve signée. Quand c'est livré ou prêt au retrait, dis-le dans l'espace.`],
            cta: "Voir la mission",
            note: "Plus personne ne peut annuler, et il n'y a plus de correction.",
          };
    case "work_started":
      return {
        subject: `${i.providerName} a commencé`,
        preheader: "Ton brief est entre ses mains.",
        title: "Le travail a commencé",
        paragraphs: [`${i.providerName} a commencé ton brief. Tu seras prévenu par e-mail dès que la première version est livrée.`, "Tu pourras alors demander jusqu'à deux tours de retours, chacun en un seul envoi."],
        cta: "Suivre la mission",
        note: "Annuler maintenant : l'acompte reste au prestataire, le reste t'est rendu.",
      };
    case "cancelled": {
      const band = i.band ?? "free";
      const by = i.cancelledBy ?? "restaurant";
      if (i.studio) {
        const started = band === "deposit";
        const when = started ? "après le début du travail" : "avant le début du travail";
        if (i.audience === "platform") {
          return {
            subject: `Mission annulée par ${by === "provider" ? i.providerName : by === "restaurant" ? i.restaurantName : "la plateforme"} : ${i.restaurantName}`,
            preheader: started ? "Le travail avait commencé : l'acompte reste au prestataire." : "Le travail n'avait pas commencé : sans frais.",
            title: "Une mission est annulée",
            paragraphs: [`${i.restaurantName} et ${i.providerName} : mission annulée ${when}.`, started ? "Le règlement (acompte au prestataire, remboursement du reste, avertissement éventuel) est à faire à la main tant que le paiement en ligne n'est pas ouvert : il t'attend sur la page Prestataires." : "Aucun frais."],
            cta: "Voir la mission",
            note: "Une annulation après le début du travail est visible dans « Annulations à régler ».",
          };
        }
        if (i.audience === "provider") {
          const money = by === "restaurant" ? (started ? "L'acompte te reste acquis." : "Aucun frais : rien n'était commencé.") : "Le restaurateur est remboursé en entier.";
          return {
            subject: by === "restaurant" ? `${i.restaurantName} annule la mission` : `Annulation enregistrée : ${i.restaurantName}`,
            preheader: money,
            title: by === "restaurant" ? "La mission est annulée" : "Ton annulation est enregistrée",
            paragraphs: [by === "restaurant" ? `${i.restaurantName} a annulé ${when}.` : `Tu as annulé ${when}.`, money],
            cta: "Voir la mission",
            note: by === "provider" && started ? "Une annulation après le début du travail est sanctionnée par un avertissement." : "Merci de ta confiance.",
          };
        }
        const money = by === "provider" ? "Tu es remboursé en entier." : started ? "L'acompte reste au prestataire ; le reste t'est rendu." : "Aucun frais : tu es remboursé en entier.";
        return {
          subject: by === "provider" ? `${i.providerName} ne peut plus faire cette mission` : `Annulation enregistrée : ${i.providerName}`,
          preheader: money,
          title: by === "provider" ? "Le prestataire arrête la mission" : "Ton annulation est enregistrée",
          paragraphs: [by === "provider" ? `${i.providerName} a annulé ${when}.` : `Tu as annulé ${when}.`, money, by === "provider" ? "Tu peux faire un nouveau brief : tes réponses ne sont pas perdues." : "Boosteats règle les montants avec toi."],
          cta: "Voir la mission",
          note: "Après le début du travail, l'acompte reste au prestataire.",
        };
      }
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
    case "proposals_received":
      return {
        subject: `${i.providerName} te propose ${i.count ?? 2} idées de tournage`,
        preheader: i.deadlineLabel ? `Choisis-en une avant ${i.deadlineLabel}.` : "Choisis celle qui te ressemble.",
        title: "Des idées de tournage t'attendent",
        paragraphs: [`${i.providerName} a préparé ${i.count ?? 2} idées pour ton tournage, la première étant celle qu'il recommande. Lis-les, regarde les exemples, puis choisis-en une.`, i.deadlineLabel ? `Sans réponse de ta part avant ${i.deadlineLabel}, la première idée est retenue d'office : tu en seras prévenu.` : "Sans réponse de ta part, la première idée est retenue d'office."],
        cta: "Voir les idées",
        note: "Aucune ne te plaît ? Tu peux demander une seule nouvelle série, en disant pourquoi pour chaque idée.",
      };
    case "proposals_again":
      return {
        subject: `${i.restaurantName} demande une nouvelle série d'idées`,
        preheader: i.deadlineLabel ? `Dépose-la avant ${i.deadlineLabel}.` : "Les raisons sont dans l'espace.",
        title: "Une nouvelle série d'idées est demandée",
        paragraphs: [`Aucune de tes idées n'a convaincu ${i.restaurantName}. Pour chacune, la raison est dans l'espace : lis-les, puis propose 2 ou 3 nouvelles idées.`, "C'est la seule nouvelle série possible : si elle ne vient pas à temps, ta première idée est retenue."],
        cta: "Lire les raisons",
        note: i.deadlineLabel ? `Date limite : ${i.deadlineLabel}.` : "Date limite : deux jours avant le tournage.",
      };
    case "proposal_chosen":
      return {
        subject: `${i.restaurantName} a choisi : ${i.title ?? "ton idée"}`,
        preheader: "L'idée est verrouillée : prépare le tournage.",
        title: "Une idée est choisie",
        paragraphs: [`${i.restaurantName} a choisi l'idée « ${i.title ?? ""} ». Elle est verrouillée : c'est celle que tu tournes. Ce qu'il faut préparer sur place est dans l'espace.`],
        cta: "Voir l'idée choisie",
        note: "Un autre choix après coup n'est plus possible.",
      };
    case "proposal_auto": {
      const reason = i.auto === "fallback" ? "la nouvelle série n'est pas arrivée à temps, on garde donc la première idée recommandée" : "il n'y a pas eu de réponse à temps, on retient donc la première idée recommandée";
      return {
        subject: `Idée retenue d'office : ${i.title ?? ""}`,
        preheader: "L'idée est verrouillée.",
        title: "Une idée est retenue d'office",
        paragraphs: [i.audience === "provider" ? `Pour le tournage chez ${i.restaurantName}, ${reason} : « ${i.title ?? ""} ». C'est celle que tu tournes.` : `Pour ton tournage avec ${i.providerName}, ${reason} : « ${i.title ?? ""} ». C'est celle qui sera tournée ; ce qu'il faut préparer est dans l'espace.`],
        cta: "Voir l'idée retenue",
        note: "Une idée retenue ne se change plus.",
      };
    }
    case "proposals_due":
      return {
        subject: `${i.restaurantName} attend tes idées de tournage`,
        preheader: i.deadlineLabel ? `À déposer avant ${i.deadlineLabel}.` : "2 ou 3 idées, la première étant ta recommandation.",
        title: "Tes idées de tournage sont attendues",
        paragraphs: [`Le tournage chez ${i.restaurantName} approche. Dépose 2 ou 3 idées (la première est celle que tu recommandes) : pour chacune, un titre, l'idée en quelques phrases, ce qu'il faut prévoir sur place et un exemple.`],
        cta: "Déposer mes idées",
        note: "Sans idée à temps, la plateforme t'appelle : le restaurateur ne peut pas choisir ce qu'il ne voit pas.",
      };
    case "proposals_choose":
      return {
        subject: `${i.providerName} t'attend : choisis ton idée de tournage`,
        preheader: i.deadlineLabel ? `Avant ${i.deadlineLabel}, sinon la première est retenue.` : "Sinon la première idée est retenue d'office.",
        title: "Choisis ton idée de tournage",
        paragraphs: [`${i.providerName} t'a proposé ${i.count ?? 2} idées. Sans réponse de ta part${i.deadlineLabel ? ` avant ${i.deadlineLabel}` : ""}, la première (celle qu'il recommande) est retenue d'office.`],
        cta: "Choisir mon idée",
        note: "Aucune ne te plaît ? Une seule nouvelle série est possible, avec une raison pour chaque idée.",
      };
    case "proposals_missing":
      return {
        subject: `Aucune idée de tournage : ${i.providerName} chez ${i.restaurantName}`,
        preheader: "Le tournage approche et le restaurateur n'a rien à choisir.",
        title: "Aucune idée de tournage déposée",
        paragraphs: [`${i.providerName} n'a déposé aucune idée pour le tournage chez ${i.restaurantName}${i.deadlineLabel ? ` (tournage ${i.deadlineLabel})` : ""}. Appelle le prestataire : sans idée, le restaurateur ne peut rien choisir.`],
        cta: "Voir la mission",
        note: "Le prestataire peut encore déposer ses idées jusqu'à trois jours avant le tournage.",
      };
    case "change_requested":
      return {
        subject: `${i.restaurantName} demande une modification du brief`,
        preheader: "Chiffre un supplément (ou « sans supplément »), ou refuse : tu as 3 jours.",
        title: "Une modification du brief est demandée",
        paragraphs: [`${i.restaurantName} souhaite changer quelque chose au brief verrouillé. La demande, avec ses pièces jointes éventuelles, est dans l'espace : lis-la, puis chiffre un supplément (il peut être nul) ou refuse en disant pourquoi.`, "Si tu ne réponds pas dans les 3 jours, la demande expire et le brief d'origine tient."],
        cta: "Lire la demande",
        note: "Une modification n'est jamais obligatoire pour toi : le brief d'origine, lui, reste ferme.",
      };
    case "change_quoted":
      return {
        subject: i.free ? `${i.providerName} accepte la modification, sans supplément` : `${i.providerName} propose un supplément pour ta modification`,
        preheader: i.free ? "Accepte pour que le changement soit pris en compte." : "Accepte ou refuse : le brief d'origine tient si tu refuses.",
        title: i.free ? "La modification est possible, sans supplément" : "Un supplément est proposé",
        paragraphs: [i.free ? `${i.providerName} peut faire ce changement sans supplément. Confirme-le pour qu'il soit pris en compte.` : `${i.providerName} peut faire ce changement avec un supplément. Le prix et les jours de livraison éventuels en plus sont dans l'espace : accepte ou refuse.`, "Sans ta réponse avant 7 jours du tournage, la demande expire et le brief d'origine tient."],
        cta: i.free ? "Confirmer la modification" : "Voir le supplément",
        note: "Tu as droit à deux demandes de modification au total.",
      };
    case "change_provider_declined":
      return {
        subject: `${i.providerName} ne peut pas faire cette modification`,
        preheader: "Le brief d'origine tient.",
        title: "La modification est refusée",
        paragraphs: [`${i.providerName} ne peut pas faire ce changement. Sa raison est dans l'espace. Rien d'autre ne change : le brief d'origine tient, la date aussi.`],
        cta: "Lire la raison",
        note: "Cette demande ne compte pas dans tes deux demandes de modification.",
      };
    case "change_accepted":
      return i.audience === "platform"
        ? {
            subject: `Supplément accepté : ${i.providerName} chez ${i.restaurantName}`,
            preheader: "À encaisser à la main tant que le paiement en ligne n'est pas ouvert.",
            title: "Un supplément est accepté",
            paragraphs: [`${i.restaurantName} a accepté le supplément de ${i.providerName} pour une modification du brief. Les montants de la mission sont mis à jour ; le supplément se règle avec le solde.`],
            cta: "Voir la mission",
            note: "Le détail (supplément, part du prestataire) est dans la trace de la mission.",
          }
        : {
            subject: `${i.restaurantName} a accepté la modification`,
            preheader: "Elle est prise en compte : le brief est complété.",
            title: "La modification est acceptée",
            paragraphs: [`${i.restaurantName} a accepté la modification${i.free ? " (sans supplément)" : " et son supplément"}. Elle complète le brief : c'est ce que tu livres. Elle est dans l'espace, avec ses pièces jointes.`],
            cta: "Voir la modification",
            note: "Les dates convenues ne changent pas, sauf les jours de livraison en plus que tu as indiqués.",
          };
    case "change_restaurant_declined":
      return {
        subject: `${i.restaurantName} garde le brief d'origine`,
        preheader: "Le supplément n'est pas accepté.",
        title: "Le supplément est refusé",
        paragraphs: [`${i.restaurantName} n'a pas accepté le supplément : le brief d'origine tient, rien ne change pour toi.`],
        cta: "Voir la mission",
        note: "Merci de ta réponse rapide.",
      };
    case "change_withdrawn":
      return {
        subject: `${i.restaurantName} retire sa demande de modification`,
        preheader: "Rien à faire : le brief d'origine tient.",
        title: "La demande est retirée",
        paragraphs: [`${i.restaurantName} a retiré sa demande de modification. Tu n'as rien à faire : le brief d'origine tient.`],
        cta: "Voir la mission",
        note: "Merci.",
      };
    case "change_expired":
      return {
        subject: i.audience === "provider" ? `Une demande de modification a expiré : ${i.restaurantName}` : `Ta demande de modification a expiré`,
        preheader: "Le brief d'origine tient.",
        title: "La demande de modification a expiré",
        paragraphs: [i.audience === "provider" ? `La demande de modification de ${i.restaurantName} est restée sans réponse : elle expire, le brief d'origine tient.` : `Ta demande de modification est restée sans réponse à temps : elle expire, le brief d'origine tient.`, i.audience === "provider" ? "Une demande ne compte pas dans les deux du restaurateur quand le prestataire n'a pas répondu." : "Elle ne compte pas dans tes deux demandes : tu peux en faire une autre tant que le tournage est à plus de 7 jours."],
        cta: "Voir la mission",
        note: "Un doute ? Écris à Boosteats.",
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
  // Pour le prestataire : le texte vient des dictionnaires (sa langue) ; pour les autres destinataires, de `copyFor` ci-dessous.
  const tr = getT(i.locale);
  const fromProvider = i.audience === "provider";
  const translated = fromProvider || (i.audience === "restaurant" && restaurantCopy(i, tr) !== null);
  const c = providerCopy(i, tr) ?? restaurantCopy(i, tr) ?? copyFor(i);
  const body = [eyebrow(translated ? tr.t("em.eyebrow") : "Mise à jour"), heading(c.title), ...c.paragraphs.map((p) => paragraph(esc(p))), button(c.cta, i.url, "#0C1509"), small(esc(c.note))];
  const html = proShell({
    restaurantName: i.audience === "restaurant" ? i.restaurantName : "Boosteats",
    logoUrl: null,
    kicker: translated ? tr.t("em.kicker") : "Ta mission",
    subject: c.subject,
    preheader: c.preheader,
    body: body.join("\n"),
    footer: { reason: i.audience === "platform" ? "Tu reçois cette alerte en tant que plateforme Boosteats." : translated ? tr.t("em.footer") : "Tu reçois cet e-mail parce qu'une mission est en cours sur Boosteats." },
    ...(fromProvider ? { brandLine: tr.t("em.brand") } : {}),
  });
  const text = `${c.title}\n\n${c.paragraphs.join("\n\n")}\n\n${c.cta} : ${i.url}\n\n${c.note}`;
  return { subject: c.subject, preheader: c.preheader, html, text };
}
