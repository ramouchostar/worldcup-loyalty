import { ArrowRight, Bell, CalendarClock, Gift, Megaphone, Store, Users, Wallet } from "lucide-react";
import { TrackedLink } from "@/components/analytics/TrackedLink";
import {
  AnalysisCta,
  CompareColumns,
  FaqList,
  Heading,
  MarketingShell,
  RelatedPages,
  Section,
  WhatsAppLink,
  type Faq,
} from "@/components/marketing/kit";
import { marketingMetadata } from "@/lib/marketing-pages";
import { EXAMPLES, LockScreen, MessageCard, StaffBoard, WhatsAppShare } from "./_visuals";

// Page « relancer vos clients » (retour de Mehdi du 2026-11-01) : exemples de
// messages, infographie du mécanisme (exemple chiffré marqué comme tel, jamais
// une promesse), coût d'un client ramené, parrainage WhatsApp, QR de l'équipe.
// Livré : annonces (push gratuit, WhatsApp en secours ; tous, ou par groupe),
// offres réservées aux clients qui les acceptent, envoi programmé en
// Croissance ; anniversaire et rappel du client qui espace ses visites
// (lib/member-strategies.ts). Les séquences d'e-mails restent éteintes (ADR 0063).

export const metadata = marketingMetadata("relancer-vos-clients");

const WHERE = "page_relancer-vos-clients";

// Exemple d'illustration (jamais une promesse) : un restaurant de quartier.
const FUNNEL = [
  { label: "Clients inscrits", value: "400", note: "votre liste, construite au comptoir", width: "100%" },
  { label: "Acceptent vos offres", value: "260", note: "les autres reçoivent seulement les infos du programme", width: "65%" },
  { label: "Reviennent dans la semaine", value: "25", note: "après un message un mardi calme", width: "18%" },
  { label: "Panier moyen", value: "16 €", note: "le ticket habituel de ces clients", width: "18%" },
];

const COSTS = [
  {
    Icon: Bell,
    title: "Un message à vos clients",
    price: "Presque rien",
    body: "La notification sur le téléphone est gratuite. Le message WhatsApp de secours coûte quelques centimes. Ces clients sont déjà à vous : vous ne payez personne pour les joindre.",
    best: true,
  },
  {
    Icon: Megaphone,
    title: "Une pub dans le quartier",
    price: "Quelques euros par jour",
    body: "Utile pour faire venir des gens qui ne vous connaissent pas encore. Vous payez pour être vu, pas pour un client déjà gagné.",
    best: false,
  },
  {
    Icon: Store,
    title: "Une plateforme de livraison",
    price: "Une commission à chaque commande",
    body: "Le client reste à la plateforme. La prochaine fois, vous repayez la commission, et c'est elle qui lui écrit.",
    best: false,
  },
];

const FAQ: Faq[] = [
  { q: "Qui reçoit mes messages ?", a: "Vous choisissez : tous vos clients inscrits, ou un groupe (écoles, entreprises, rues et quartiers, taxis). Une offre commerciale ne part qu'aux clients qui ont accepté d'en recevoir. Une information liée au programme part à tous." },
  { q: "Par où partent les messages ?", a: "En notification sur le téléphone du client, ce qui est gratuit, avec WhatsApp en secours quand la notification ne passe pas." },
  { q: "Je dois écrire chaque message moi-même ?", a: "Oui, vous gardez la main sur ce qui part, en quelques lignes. Le message d'anniversaire et le rappel d'un habitué qui espace ses visites partent tout seuls." },
  { q: "Je peux préparer un message à l'avance ?", a: "Oui, avec le plan Croissance : vous écrivez le message du match le lundi, il part le samedi à 16 h." },
  { q: "Combien de messages par semaine sans fatiguer mes clients ?", a: "Un par semaine au maximum, et seulement quand vous avez une vraie raison : un soir calme, un nouveau plat, une fête. Un message utile se lit, un message de trop se coupe." },
  { q: "Comment je sais si un message a marché ?", a: "Mettez une offre précise avec une date limite, et regardez les tickets qui arrivent les jours suivants dans votre console. Les clients qui reviennent le montrent tout de suite." },
  { q: "Comment ma liste de clients grandit ?", a: "Au comptoir, avec le QR et le cadeau de bienvenue ; par chaque employé, avec son propre QR ; et par vos clients eux-mêmes, qui invitent leurs amis par WhatsApp." },
];

export default function RelancerVosClientsPage() {
  return (
    <MarketingShell faq={FAQ}>
      {/* 1. Héros sombre : l'écran verrouillé du client. */}
      <section className="bg-ink overflow-hidden">
        <div className="max-w-[1200px] mx-auto px-5 sm:px-8 pt-14 sm:pt-20 pb-16 grid lg:grid-cols-[1.1fr_0.9fr] gap-12 items-center">
          <div>
            <Heading
              as="h1"
              onDark
              eyebrow="Relancer vos clients · Faire revenir"
              title="Un mardi calme ? Écrivez à vos clients."
              intro="Vos clients inscrits sont déjà venus chez vous. Un message au bon moment, sur leur téléphone, leur donne une raison de revenir ce soir. Et ça ne vous coûte presque rien : ces clients sont à vous."
            />
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <TrackedLink
                ctaId="audit_gratuit"
                ctaLocation={WHERE}
                audience="restaurateur"
                href="/audit-gratuit"
                className="inline-flex justify-center bg-moss text-ink text-[15px] font-bold rounded-lg px-6 py-3.5 hover:bg-moss-light transition-colors"
              >
                Analyser mon restaurant gratuitement
              </TrackedLink>
              <WhatsAppLink location={WHERE} variant="onDark" message="Bonjour, je voudrais pouvoir écrire à mes clients pour les faire revenir." />
            </div>
          </div>
          <div className="flex justify-center">
            <LockScreen />
          </div>
        </div>
      </section>

      {/* 2. Cinq messages qui marchent. */}
      <Section>
        <Heading
          eyebrow="Des exemples à reprendre"
          title="Cinq messages qui font revenir du monde"
          intro="Chaque message répond à une situation que vous connaissez. Une phrase, une offre claire, une date limite. Les voici tels que vos clients les reçoivent."
        />
        <div className="mt-10 grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {EXAMPLES.map((e) => (
            <MessageCard key={e.tag} e={e} />
          ))}
          <div className="rounded-3xl border-2 border-dashed border-paper-border p-6 flex flex-col justify-center">
            <p className="font-display text-[22px] font-bold text-ink leading-tight m-0">Et les vôtres</p>
            <p className="font-landing text-[15px] leading-[1.65] text-ink-muted mt-2">
              Pluie toute la journée, examens à l&apos;université voisine, travaux dans la rue : chaque semaine apporte sa raison d&apos;écrire. Vous avez l&apos;idée, le message part en une minute.
            </p>
          </div>
        </div>
      </Section>

      {/* 3. L'infographie : du message au chiffre d'affaires. */}
      <Section tone="white">
        <div className="grid lg:grid-cols-[0.85fr_1.15fr] gap-12 items-start">
          <div>
            <Heading
              eyebrow="Comment ça se transforme en chiffre"
              title="D'un message envoyé à une caisse qui sonne"
              intro="Le mécanisme est simple : plus votre liste est longue, plus un message ramène de monde. Voici un exemple pour un restaurant de quartier, pour montrer comment les chiffres s'enchaînent."
            />
            <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-warn/10 text-warn text-[13px] font-bold px-3 py-1.5">
              Exemple d&apos;illustration, pas une promesse
            </p>
            <p className="font-landing text-[15px] leading-[1.7] text-ink-muted mt-4">
              Vos chiffres dépendent de votre quartier, de votre offre et du moment choisi. Ce qui ne change pas : un client qui vous connaît déjà revient plus facilement qu&apos;un inconnu ne pousse la porte.
            </p>
          </div>
          <div className="rounded-3xl bg-paper border border-paper-border p-6 sm:p-8">
            <ol className="space-y-5">
              {FUNNEL.slice(0, 3).map((f, i) => (
                <li key={f.label}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[14px] font-semibold text-ink">{i + 1}. {f.label}</span>
                    <span className="font-display text-[28px] font-bold text-ink tabular-nums">{f.value}</span>
                  </div>
                  <div className="h-4 rounded-full bg-white border border-paper-border mt-2 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-moss-dark to-moss" style={{ width: f.width }} />
                  </div>
                  <p className="text-[13px] text-ink-faint mt-1.5 m-0">{f.note}</p>
                </li>
              ))}
            </ol>
            <div className="mt-7 rounded-2xl bg-ink p-5 flex flex-wrap items-center gap-3 text-white">
              <span className="font-display text-[22px] font-bold">25 visites</span>
              <span className="text-night-text">×</span>
              <span className="font-display text-[22px] font-bold">16 € de panier</span>
              <ArrowRight className="w-5 h-5 text-moss-light" aria-hidden />
              <span className="font-display text-[26px] font-bold text-moss-light">400 € de ventes</span>
              <p className="w-full text-[13px] text-night-text m-0">pour un message qui ne vous a presque rien coûté, un mardi qui aurait été calme.</p>
            </div>
          </div>
        </div>
      </Section>

      {/* 4. Ce que coûte un client ramené. */}
      <Section>
        <Heading
          center
          eyebrow="Le bon calcul"
          title="Ramener un client que vous avez déjà, c'est le moins cher"
          intro="La pub et les plateformes ont leur place. Mais pour un client qui est déjà venu, vous n'avez pas besoin de payer quelqu'un pour le joindre."
        />
        <ul className="mt-12 grid md:grid-cols-3 gap-5">
          {COSTS.map(({ Icon, title, price, body, best }) => (
            <li
              key={title}
              className={`rounded-3xl p-6 border ${best ? "bg-ink text-white border-ink shadow-[0_24px_60px_rgba(10,10,10,0.25)] md:-translate-y-3" : "bg-white border-paper-border"}`}
            >
              <Icon className={`w-6 h-6 ${best ? "text-moss-light" : "text-ink-muted"}`} aria-hidden />
              <h3 className={`font-bold text-[18px] mt-4 ${best ? "text-white" : "text-ink"}`}>{title}</h3>
              <p className={`font-display text-[24px] font-bold mt-2 ${best ? "text-moss-light" : "text-ink"}`}>{price}</p>
              <p className={`font-landing text-[15px] leading-[1.65] mt-3 ${best ? "text-night-text" : "text-ink-muted"}`}>{body}</p>
            </li>
          ))}
        </ul>
      </Section>

      {/* 5. Ce qui part tout seul. */}
      <Section tone="tint">
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          <Heading
            eyebrow="Sans y penser"
            title="Deux messages partent tout seuls"
            intro="Vous n'avez pas à tenir un calendrier. Ces deux-là arrivent au bon client, le bon jour, une seule fois."
          />
          <ul className="space-y-4">
            {[
              { Icon: Gift, title: "L'anniversaire, avec un cadeau", body: "Le jour de son anniversaire, le client reçoit un mot et un cadeau à venir chercher. Plus il est fidèle, plus le cadeau est généreux, toujours dans votre taux cadeaux." },
              { Icon: CalendarClock, title: "Le rappel de l'habitué qui s'éloigne", body: "Un client qui venait chaque semaine et laisse passer deux fois son délai habituel reçoit un petit rappel. Au plus une fois par mois, pour ne jamais insister." },
            ].map(({ Icon, title, body }) => (
              <li key={title} className="rounded-2xl bg-white border border-moss/20 p-5 flex gap-4">
                <span className="grid place-items-center w-11 h-11 rounded-xl bg-moss text-ink shrink-0">
                  <Icon className="w-5 h-5" aria-hidden />
                </span>
                <div>
                  <h3 className="font-bold text-[17px] text-ink">{title}</h3>
                  <p className="font-landing text-[15px] leading-[1.65] text-ink-muted mt-1">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* 6. Faire grandir la liste : parrainage et équipe. */}
      <Section tone="white">
        <Heading
          center
          eyebrow="Plus de clients à qui écrire"
          title="Votre liste grandit au comptoir, et par vos clients"
          intro="Un message touche autant de monde que votre liste compte de clients. Deux leviers la font grossir chaque semaine."
        />
        <div className="mt-12 grid lg:grid-cols-2 gap-10">
          <div className="space-y-5">
            <WhatsAppShare />
            <div className="text-center max-w-[420px] mx-auto">
              <h3 className="font-bold text-[18px] text-ink flex items-center justify-center gap-2">
                <Users className="w-5 h-5 text-moss-dark" aria-hidden /> Le parrainage par WhatsApp
              </h3>
              <p className="font-landing text-[15px] leading-[1.65] text-ink-muted mt-2">
                Chaque client a son lien d&apos;invitation. Il le partage à ses amis sur WhatsApp ; quand cinq amis se sont inscrits, il gagne un jeton, et quatre jetons font un cadeau au comptoir.
              </p>
            </div>
          </div>
          <div className="space-y-5">
            <StaffBoard />
            <div className="text-center max-w-[420px] mx-auto">
              <h3 className="font-bold text-[18px] text-ink flex items-center justify-center gap-2">
                <Wallet className="w-5 h-5 text-moss-dark" aria-hidden /> Un QR par employé
              </h3>
              <p className="font-landing text-[15px] leading-[1.65] text-ink-muted mt-2">
                Chaque membre de votre équipe a son propre QR. Vous voyez qui inscrit le plus de clients, et vous pouvez récompenser les meilleurs.
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* 7. Ce qui marche et ce qui fatigue. */}
      <Section>
        <Heading
          eyebrow="Les bonnes pratiques"
          title="Ce qui fait revenir, ce qui fait se désinscrire"
          intro="Ce qu'on voit sur le terrain, message après message."
        />
        <div className="mt-10">
          <CompareColumns
            badTitle="Ce qui fatigue vos clients"
            bad={[
              "Un message tous les deux jours, sans raison.",
              "« -10 % sur tout » sans date limite : personne ne se presse.",
              "Un long texte avec cinq offres en même temps.",
              "Le message du midi envoyé à 14 h.",
              "Une promo envoyée à des clients qui ont refusé les offres.",
            ]}
            goodTitle="Ce qui les fait revenir"
            good={[
              "Un message par semaine au plus, quand il y a une vraie occasion.",
              "Une offre précise, valable ce soir ou ce week-end.",
              "Une seule idée, en deux phrases, avec ce qu'il faut dire ou montrer au comptoir.",
              "L'envoi une heure avant le service, quand on se demande où manger.",
              "Les offres pour ceux qui les acceptent, les infos du programme pour tous.",
            ]}
          />
        </div>
      </Section>

      {/* 8. Questions. */}
      <Section tone="white" width="max-w-[860px]">
        <Heading title="Vos questions sur les messages" />
        <div className="mt-8">
          <FaqList items={FAQ} />
        </div>
      </Section>

      <AnalysisCta
        location={WHERE}
        title="Commencez par voir où en est votre restaurant"
        body="Combien de clients vous laissent un avis, qui sont vos voisins, ce que Google montre de vous. Une note sur 100 en moins d'une minute."
        whatsappMessage="Bonjour, je voudrais pouvoir écrire à mes clients pour les faire revenir."
      />
      <RelatedPages slugs={["programme-fidelite-restaurant", "publicite-restaurant", "chiffre-affaires-restaurant"]} />
    </MarketingShell>
  );
}
