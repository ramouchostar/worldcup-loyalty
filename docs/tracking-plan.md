# Plan de tracking — GA4

Mesure d'audience de Boosteats. Trois parcours couverts : **site vitrine**,
**tunnel membre**, **tunnel restaurateur**. La console admin est volontairement
hors périmètre (c'est un outil de travail, pas une surface d'acquisition).

- Implémentation : `gtag.js` via `@next/third-parties/google`, pas de GTM.
- Consentement : **Consent Mode v2**, mode avancé, tout refusé par défaut.
- Activation : `NEXT_PUBLIC_GA_MEASUREMENT_ID`. Non renseignée → aucun script
  Google injecté, aucune bannière, CSP fermée à Google.

---

## 1. Les deux règles non négociables

### Aucun euro ne part côté client (ADR 0007 / ADR 0028)

La charge utile d'un événement analytics est lisible dans l'onglet réseau du
navigateur. Envoyer `value: 32.50` reviendrait donc à publier côté client
exactement ce que les ADRs interdisent d'afficher.

En conséquence :

- les montants de commande partent en **tranches** (`amount_band`), calquées sur
  les paliers solo : `lt_15`, `15_24`, `25_39`, `40_59`, `60_plus` ;
- aucun paramètre `value`, `currency`, `total_revenue`, `target_revenue`,
  `community_score`, `cost_price` n'est jamais émis ;
- `reward_banked` n'envoie pas le nombre de points crédités — c'est
  `floor(montant)`, donc le montant en clair.

> Corollaire : les rapports « e-commerce » et « revenu » de GA4 resteront vides,
> et c'est voulu. Le chiffre d'affaires se lit dans la console restaurateur, qui
> a le droit aux euros.

### Aucun identifiant de membre ne part chez Google (ADR 0025)

Pas de `user_id`, pas d'email, pas de téléphone, pas de nom d'équipe ni de nom
d'établissement libre. La plateforme est responsable de traitement unique et n'a
pas de DPA Google couvrant un transfert d'identifiants.

La seule dimension utilisateur est `member_status` : `anonyme` / `membre` /
`restaurateur`. Elle segmente sans désigner personne. `restaurant_id` est un
identifiant technique d'établissement (pas de personne) et reste transmis.

---

## 2. Événements

Nomenclature `objet_action`, minuscules et underscores. `sign_up` et `login`
gardent le nom recommandé par Google (rapports natifs, import Google Ads).

La source de vérité est **`lib/analytics.ts`** : la map `AnalyticsEventMap` ne
compile pas si un nom ou un paramètre diverge. Ce tableau en est le reflet
lisible.

### Site vitrine

| Événement | Paramètres | Déclencheur |
|---|---|---|
| `cta_clicked` | `cta_id`, `cta_location`, `audience` | Clic sur un CTA (`TrackedLink`) |
| `cookie_consent_granted` | `surface` | Acceptation dans la bannière |

`cta_id` en production : `devenir_partenaire` (header desktop, hero, étapes,
footer, secteurs_cta), `voir_le_produit`, `rejoindre`, `comment_ca_marche`.

Le bouton mobile du header n'est PAS instrumenté : il mène à la connexion
(`/login?as=resto`), pas au tunnel partenaire — au même titre que l'entrée
« Connexion » de la navigation desktop.

> `cta_id` est la clé d'analyse : le garder **stable** même si le libellé du
> bouton change, sinon la série temporelle se coupe en deux.

### Tunnel membre

| Événement | Paramètres | Déclencheur |
|---|---|---|
| `restaurant_landing_viewed` | `restaurant_id`, `entry_source` | Affichage de `/r/[id]` (cible des QR) |
| `sign_up` | `method`, `funnel` | Compte créé (email ou Google) |
| `member_profile_completed` | `zones_count`, `is_minor` | Profil complété (`/register`) |
| `login` | `method` | Connexion réussie |
| `team_joined` | `join_source`, `team_type` | Reconnaissance d'une communauté (ADR 0031) |
| `team_declined` | `suggestions_shown` | « Aucune de ces équipes » |
| `order_submit_started` | `restaurant_id`, `visitor` | Ouverture du formulaire de scan |
| `visitor_tour_viewed` / `visitor_tour_completed` / `visitor_tour_skipped` | `restaurant_id` | Tour de bienvenue visiteur (ADR 0040) |
| `visitor_ticket_captured` | `restaurant_id` | Photo de ticket prise sans compte (ADR 0040) |
| `visitor_signup_started` | `restaurant_id`, `method` | Départ vers la connexion depuis « garde tes points » |
| `visitor_ticket_resumed` | `restaurant_id` | Photo reprise après connexion (`?resume=1`) |
| `order_submitted` | `restaurant_id`, `amount_band`, `has_receipt_photo` | Ticket envoyé |
| `order_result` | `restaurant_id`, `result` | Verdict rendu au membre |
| `reward_redeem_started` | `restaurant_id` | Coupon 10 min généré (ADR 0011) |
| `reward_banked` | `restaurant_id` | Cadeau mis en réserve (ADR 0021) |
| `micro_reward_claimed` | `channel` | Action sociale réclamée |
| `referral_shared` | `channel` | Partage du lien de parrainage |
| `team_invite_shared` | `channel` | Partage du lien d'adhésion d'équipe |
| `push_permission_granted` | — | Notifications autorisées |
| `pwa_installed` | — | PWA installée |
| `pwa_install_prompted` | `audience`, `surface` | Espace d'installation permanent montré à quelqu'un sans l'app (ADR 0038) — le rattrapage, pas le premier passage |

`entry_source` reprend `utm_source` s'il est présent (les QR imprimés portent
`utm_source=qr_code`), sinon `direct`.

### Tunnel restaurateur

| Événement | Paramètres | Déclencheur |
|---|---|---|
| `partner_signup_started` | `source` | Ouverture de `/become-a-partner` |
| `partner_step_completed` | `step_name`, `step_number` | Étape validée (compte 1 → menu 2 → ticket 3 → social 4) |
| `partner_onboarding_completed` | `steps_total` | Étape 4 franchie, y compris si les réseaux sont passés |

---

## 3. Le cas des événements « à la redirection »

`sign_up`, `login`, `member_profile_completed` et `partner_step_completed` se
concluent par un `redirect()` de Server Action ou un aller-retour OAuth : **le
code qui suit l'appel ne s'exécute jamais**. Impossible d'émettre l'événement
sur place.

Mécanique retenue (`lib/analytics-pending.ts`) :

1. le formulaire dépose une *intention* dans `sessionStorage` (`queueEvent`) ;
2. `<AnalyticsIdentity>`, monté dans les layouts qui ont **déjà résolu la
   session**, vide la file (`flushEvents`).

Un abandon en route — mot de passe refusé, OAuth annulé chez Google — ne produit
donc aucun événement : la page qui déclenche l'émission est inatteignable sans
session.

Points de montage de `<AnalyticsIdentity>` :

| Fichier | Statut | Ce qu'il libère |
|---|---|---|
| `app/r/[restaurantId]/layout.tsx` | `membre` | `sign_up`, `login`, `member_profile_completed` |
| `app/become-a-partner/[restaurantId]/{menu,receipt,social}/page.tsx` | `restaurateur` | étapes 1 → 3 |
| `app/admin/[restaurantId]/layout.tsx` | `restaurateur` | étape 4 + `partner_onboarding_completed` |

**Limite connue et assumée** : une inscription confirmée par email dans un
*autre* onglet perd son `sign_up` (le `sessionStorage` est propre à l'onglet).
Le `member_profile_completed` qui suit, lui, remonte normalement.

---

## 4. Consentement

### Ce qui est implémenté

- Valeurs par défaut **denied** posées en `beforeInteractive`, donc avant que
  `gtag.js` n'ait la moindre chance d'écrire un cookie.
- `ad_storage`, `ad_user_data`, `ad_personalization` sont refusés **en dur** :
  la plateforme ne fait pas de publicité Google, et un signal publicitaire qu'on
  ne consomme pas est un risque juridique gratuit. À rouvrir explicitement le
  jour où Google Ads est branché.
- `ads_data_redaction` et `url_passthrough` activés.
- Bannière : **Refuser** et **Accepter** au même niveau, un clic chacun
  (exigence APD/GBA — le refus doit être aussi simple que l'acceptation).
- Choix stocké 6 mois dans le cookie `boosteats_consent` (`1:granted`).
- Retrait possible à tout moment via « Gérer mes cookies » sur `/privacy`.
- Bannière masquée sur `/coupon/*` et `/admin/coupon/*` (coupon chronométré
  10 min au comptoir, ADR 0011) et sur `/offline`.

### Mode avancé vs mode basique

Le mode **avancé** est actif : `gtag.js` est chargé pour tout le monde, mais tant
que le consentement est refusé il n'écrit aucun cookie et n'envoie que des pings
sans identifiant, que GA4 utilise pour **modéliser** les conversions manquantes.

Le mode **basique** (ne charger `gtag.js` qu'après acceptation) est plus
conservateur mais aveugle sur les visiteurs qui refusent. Pour basculer :
conditionner le rendu de `<GoogleAnalytics>` dans
`components/analytics/Analytics.tsx` à la lecture du cookie de consentement.

### Re-consentement

Incrémenter `CONSENT_VERSION` dans `lib/analytics-consent.ts` invalide tous les
choix existants et refait apparaître la bannière — c'est le mécanisme exigé par
l'ADR 0025 §4 en cas de changement matériel (nouvel outil de mesure, nouvelle
finalité).

### Articulation avec la table `consents`

Volontairement découplé. Le consentement ePrivacy doit être recueilli **avant**
toute écriture sur le terminal, donc avant l'inscription, donc pour un visiteur
sans `user_id` — seul un cookie couvre ce cas. Rattacher le choix au membre plus
tard reste possible (ajouter la finalité `analytics` à `consents` et rejouer le
cookie à la connexion), mais n'est pas nécessaire à la conformité.

---

## 5. À faire dans l'interface GA4 (une seule fois)

Le code est prêt ; ces réglages-là ne se font que dans l'admin GA4.

### Création

1. **Créer la propriété** — fuseau `Europe/Brussels`, devise `EUR`.
2. **Créer le flux de données web** sur le domaine de production
   (`boosteats.tech`). Récupérer l'**ID de mesure** `G-XXXXXXXXXX`.
3. **Renseigner `NEXT_PUBLIC_GA_MEASUREMENT_ID`** sur Vercel — production
   uniquement dans un premier temps. Redéployer (la CSP est calculée au build).

### Confidentialité (obligatoire avant de collecter)

4. **Conservation des données** : Admin → Collecte → Conservation → **14 mois**
   (le défaut de 2 mois rend toute analyse saisonnière impossible).
5. **Google Signals** : **désactivé**. Il implique un partage publicitaire
   cross-device qui n'est couvert ni par la bannière ni par l'ADR 0025.
6. **Paramètres de collecte de données publicitaires** : désactivés.
7. **Localisation des données / traitement UE** : vérifier que l'option
   européenne est active si le compte la propose.
8. **Filtrer le trafic interne** : Admin → Données → Filtres, sur l'IP du
   restaurant pilote et la vôtre — sinon les tests polluent le tunnel membre.

### Dimensions personnalisées

Admin → Définitions personnalisées. **Sans cette étape les paramètres sont bien
collectés mais invisibles dans les rapports.**

| Nom | Portée | Paramètre |
|---|---|---|
| Statut membre | Utilisateur | `member_status` |
| Établissement | Événement | `restaurant_id` |
| Tranche de montant | Événement | `amount_band` |
| Identifiant CTA | Événement | `cta_id` |
| Emplacement CTA | Événement | `cta_location` |
| Audience | Événement | `audience` |
| Source d'entrée | Événement | `entry_source` |
| Étape partenaire | Événement | `step_name` |
| Résultat de commande | Événement | `result` |
| Type d'équipe | Événement | `team_type` |
| Origine d'adhésion | Événement | `join_source` |
| Canal de partage | Événement | `channel` |

### Conversions (« événements clés »)

Admin → Événements clés :

| Conversion | Événement | Comptage |
|---|---|---|
| Inscription membre | `sign_up` | Une fois par session |
| Profil membre complété | `member_profile_completed` | Une fois par session |
| Première commande scannée | `order_submitted` | Chaque événement |
| Partenaire inscrit | `partner_onboarding_completed` | Une fois par session |

Ne pas marquer `cta_clicked` comme conversion : c'est un signal de milieu de
tunnel, il noierait les vraies conversions.

### Exploration recommandée

Une exploration « Entonnoir » sur : `restaurant_landing_viewed` → `sign_up` →
`member_profile_completed` → `team_joined` → `order_submitted` →
`reward_redeem_started`. C'est le parcours complet du QR au cadeau récupéré.

---

## 6. Vérifier que ça marche

1. Déployer avec l'ID de mesure renseigné.
2. Ouvrir le site, **accepter** la bannière.
3. GA4 → Admin → **DebugView**. Sans extension, ajouter `?debug_mode=1` à
   l'URL, ou installer *Google Analytics Debugger*.
4. Contrôler dans l'ordre : `page_view`, puis `cta_clicked` au clic sur un CTA,
   puis `sign_up` à l'arrivée sur l'app membre.

### Symptômes fréquents

| Symptôme | Cause la plus probable |
|---|---|
| Aucun événement | `NEXT_PUBLIC_GA_MEASUREMENT_ID` absent du build (elle est inlinée au build, pas lue au runtime) — redéployer |
| Erreur CSP `googletagmanager` en console | Build fait sans la variable : la CSP a été générée en version fermée |
| Événements présents, paramètres absents des rapports | Dimensions personnalisées non déclarées (§5) |
| `sign_up` manquant mais `login` présent | Confirmation par email ouverte dans un autre onglet (§3) |
| Tout est vide malgré l'acceptation | Bloqueur de pub — tester en navigation privée sans extension |

---

## 7. Ce qui n'est pas fait

- **Google Tag Manager** : écarté. Il ouvrirait largement la CSP et sortirait la
  logique de mesure du dépôt. Si le besoin apparaît (pixels publicitaires
  multiples), la couche `track()` peut alimenter un `dataLayer` sans réécriture.
- **Google Ads / Meta Pixel** : aucun signal publicitaire n'est collecté.
- **Console admin** : non instrumentée (hors périmètre).
- **Mesure côté serveur** (Measurement Protocol) : les validations de commande
  différées (file admin, ADR 0008) ne remontent donc pas. `order_result` ne
  couvre que le verdict immédiat.

---

## 8. Un mot sur le MCP Google Analytics

Le serveur MCP officiel (`googleanalytics/google-analytics-mcp`) existe, mais il
**lit** GA4 (`run_report`, `run_realtime_report`, `run_funnel_report`,
`get_account_summaries`, `get_custom_dimensions_and_metrics`). Il ne crée pas de
propriété, ne pose pas de tag et n'écrit aucune configuration.

Il devient utile **une fois ce plan déployé et les données accumulées** : il
permet d'interroger les rapports en langage naturel plutôt que de naviguer dans
l'interface. Il ne remplace jamais l'étape §5.
