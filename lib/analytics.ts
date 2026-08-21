// Couche unique d'émission d'événements GA4.
//
// Tout passe par `track()` : aucun appel `gtag()` direct ailleurs dans le code.
// C'est ce qui rend vérifiable la règle ADR 0007 / ADR 0028 — *aucun euro ne
// franchit la frontière client*. Un événement analytics part du navigateur du
// membre : sa charge utile est lisible dans l'onglet réseau. Envoyer
// `value: 32.50`, `total_revenue` ou `target_revenue` reviendrait donc à
// publier côté client ce que les ADRs interdisent d'afficher.
//
// Conséquence pratique : les montants sont envoyés en **tranches**
// (`amount_band`), jamais en euros. Les tranches sont exactement celles des
// paliers solo (CONTEXT.md) — donc analytiquement utiles sans être réversibles.
//
// Deuxième règle : **aucun identifiant de membre n'est envoyé à Google**. Pas
// de `user_id`, pas d'email, pas de téléphone. La plateforme est responsable
// de traitement unique (ADR 0025) et n'a pas de DPA Google couvrant un
// transfert d'identifiants. La segmentation se fait sur `member_status`, qui
// ne désigne personne.

export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "";

/** GA4 n'est câblé que si un ID de mesure est configuré (dev local = silencieux). */
export const analyticsEnabled = GA_MEASUREMENT_ID.length > 0;

// ── Vocabulaire ───────────────────────────────────────────────────────────────

/** À qui s'adresse la surface où l'événement est né. */
export type Audience = "restaurateur" | "membre" | "public";

/** Les trois parcours mesurés (la console admin est hors périmètre GA4). */
export type Funnel = "vitrine" | "membre" | "restaurateur";

export type SignupMethod = "email" | "google";

/**
 * Tranches de montant de commande — identiques aux paliers solo (CONTEXT.md).
 * On envoie la tranche, jamais l'euro (ADR 0028).
 */
export type AmountBand = "lt_15" | "15_24" | "25_39" | "40_59" | "60_plus";

export function amountBand(amountEur: number): AmountBand {
  if (amountEur < 15) return "lt_15";
  if (amountEur < 25) return "15_24";
  if (amountEur < 40) return "25_39";
  if (amountEur < 60) return "40_59";
  return "60_plus";
}

// ── Catalogue d'événements ────────────────────────────────────────────────────
//
// Toute la nomenclature vit ici. Un événement absent de cette map ne compile
// pas — c'est volontaire : GA4 ne prévient jamais qu'un nom a été mal tapé, il
// crée simplement un deuxième événement qui ne remontera dans aucun rapport.
//
// Convention : objet_action, minuscules + underscores. `sign_up` et `login`
// gardent le nom recommandé par Google (rapports natifs + import Google Ads).

export type AnalyticsEventMap = {
  // ─ Site vitrine ─
  /** Clic sur un appel à l'action de la vitrine (Hero, plans, étapes, header…). */
  cta_clicked: {
    cta_id: string;
    cta_location: string;
    audience: Audience;
  };

  // ─ Tunnel restaurateur ─
  /** Le restaurateur ouvre le formulaire de création d'établissement. */
  partner_signup_started: { source: string };
  /** Une étape d'onboarding établissement est validée. */
  partner_step_completed: {
    step_name: "compte" | "menu" | "ticket" | "social";
    step_number: number;
  };
  /** L'onboarding est terminé — l'établissement part en validation super-admin. */
  partner_onboarding_completed: { steps_total: number };

  // ─ Tunnel membre ─
  /** Atterrissage sur la page publique d'un établissement (cible des QR). */
  restaurant_landing_viewed: {
    restaurant_id: string;
    entry_source: string;
  };
  /** Création de compte aboutie (compte d'authentification). */
  sign_up: { method: SignupMethod; funnel: Funnel };
  /**
   * Profil complété : prénom, date de naissance, zones, consentements
   * (ADR 0018 + 0025). Étape distincte de `sign_up` — c'est là que se perdent
   * les comptes créés qui ne deviennent jamais des membres.
   */
  member_profile_completed: { zones_count: number; is_minor: boolean };
  /** Connexion d'un compte existant. */
  login: { method: SignupMethod };
  /** Le membre rejoint une équipe, quel que soit le chemin. */
  team_joined: {
    join_source: "reconnaissance" | "zone" | "lien" | "creation";
    team_type: string;
  };
  /** La question de reconnaissance (ADR 0031) est ressortie sans équipe. */
  team_declined: { suggestions_shown: number };
  /** Le formulaire de soumission de ticket est ouvert. */
  order_submit_started: { restaurant_id: string };
  /** Ticket soumis — `amount_band`, jamais le montant (ADR 0028). */
  order_submitted: {
    restaurant_id: string;
    amount_band: AmountBand;
    has_receipt_photo: boolean;
  };
  /** Verdict rendu au membre après la soumission. */
  order_result: {
    restaurant_id: string;
    result: "validated" | "pending_review" | "rejected";
  };
  /** Le membre déclenche son coupon de récupération 10 min (ADR 0011). */
  reward_redeem_started: { restaurant_id: string };
  /** Le membre met son cadeau de côté dans sa réserve (ADR 0021). */
  reward_banked: { restaurant_id: string };
  /** Une micro-récompense sociale est réclamée (ADR : avis Google, IG, TikTok, FB). */
  micro_reward_claimed: { channel: string };
  /** Partage du lien de parrainage — le jeton, lui, ne tombe qu'à l'inscription de l'ami. */
  referral_shared: { channel: "whatsapp" | "copy" | "native" };
  /** Partage du lien d'adhésion à une équipe — boucle de recrutement distincte du parrainage. */
  team_invite_shared: { channel: "whatsapp" | "copy" | "native" };
  /** Installation de la PWA acceptée. */
  pwa_installed: Record<string, never>;
  /**
   * L'espace d'installation permanent est montré à quelqu'un qui n'a pas
   * l'app (ADR 0038) — distinct du moment unique de l'onboarding : c'est la
   * mesure du rattrapage, pas celle du premier passage.
   */
  pwa_install_prompted: { audience: "membre" | "restaurateur"; surface: string };
  /** Autorisation des notifications push accordée. */
  push_permission_granted: Record<string, never>;

  // ─ Transverse ─
  /** Choix exprimé dans la bannière cookies (envoyé seulement si accepté). */
  cookie_consent_granted: { surface: string };
};

export type AnalyticsEventName = keyof AnalyticsEventMap;

// ── Propriétés utilisateur ────────────────────────────────────────────────────

/**
 * Statut du visiteur — la seule dimension « utilisateur » envoyée à GA4.
 * Volontairement grossière : elle segmente sans jamais désigner quelqu'un.
 */
export type MemberStatus = "anonyme" | "membre" | "restaurateur";

// ── Émission ──────────────────────────────────────────────────────────────────

type GtagFn = (...args: unknown[]) => void;

declare global {
  interface Window {
    gtag?: GtagFn;
    dataLayer?: unknown[];
  }
}

/**
 * Émet un événement GA4. Silencieux et sans effet si GA n'est pas configuré,
 * si on est côté serveur, ou si le visiteur a refusé les cookies (dans ce
 * dernier cas c'est le Consent Mode v2 qui neutralise l'envoi, pas ce code —
 * l'événement part en ping sans cookie et n'est pas rattaché à une session).
 *
 * Ne jette jamais : une erreur de mesure ne doit pas casser un parcours.
 */
export function track<K extends AnalyticsEventName>(
  name: K,
  params: AnalyticsEventMap[K],
): void {
  if (!analyticsEnabled || typeof window === "undefined") return;
  try {
    window.gtag?.("event", name, params);
  } catch {
    // Bloqueur de pub, script non chargé, quota navigateur — sans conséquence.
  }
}

/** Positionne le statut du visiteur pour les événements suivants. */
export function setMemberStatus(status: MemberStatus): void {
  if (!analyticsEnabled || typeof window === "undefined") return;
  try {
    window.gtag?.("set", "user_properties", { member_status: status });
  } catch {
    /* idem */
  }
}
