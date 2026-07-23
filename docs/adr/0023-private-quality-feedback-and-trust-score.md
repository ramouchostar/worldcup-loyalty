# ADR 0023 — Canal qualité privé, baromètre de confiance & service recovery (« note inversée »)

**Statut** : Proposé — **v1 implémentable en l'état** (couche A ci-dessous). Les points marqués « À valider (juriste) » doivent être confirmés avant commercialisation. Ceci est une décision d'architecture, pas un avis juridique. Prolonge l'**ADR 0022** (gouvernance des données) et applique l'**ADR 0007** (métriques établissement invisibles côté client) **en miroir**.

## Contexte

Les avis publics (Google, TripAdvisor) sont **publics, punitifs et irréversibles** : un seul avis négatif nuit durablement, et le restaurateur n'a aucun canal pour réparer avant l'exposition. C'est l'angoisse n°1 des petits comme des grands établissements.

Le porteur de projet veut **inverser le modèle** : la note d'un établissement n'est **pas exposée aux clients** mais **uniquement au restaurateur**, sous forme d'un **baromètre de confiance** privé. Le membre dispose d'un espace **sûr** pour (a) **encourager** l'établissement, (b) **proposer des améliorations**, (c) **signaler** une erreur, une commande de moindre qualité ou un service décevant. Le restaurateur obtient un **service qualité** : il voit *quand* les écarts se produisent et agit vite — l'objectif est de transformer un futur avis 1 étoile en **signal privé réparable**.

Principe directeur (acté avec le porteur de projet) : la plateforme est une **couche de données**, **pas un logiciel de management RH**. Elle met des données **opérationnelles** à disposition ; **le restaurateur tire ses propres conclusions et agit**. La plateforme **ne réalise aucune évaluation du personnel**.

Double finalité assumée : (a) **intelligence qualité** pour l'établissement (repérer les goulots d'étranglement, agir vite sur les écarts) et (b) **espace de communication** membre ↔ établissement créant un vrai **lien** — le membre exprime sa satisfaction *ou* son mécontentement dans un cadre **sûr**. Ce canal est **strictement indépendant** de la micro-récompense « avis Google » (CONTEXT.md) : aucun routage des membres selon leur sentiment (**pas de *review gating***, voir Alternatives rejetées). L'avis Google reste un levier de **visibilité externe** sans contrainte sur le membre ; le canal qualité est un mécanisme **interne** — les deux ne se parlent jamais.

Posture assumée (« **bon père de famille** ») : on **encadre** l'usage au mieux (garde-fous ci-dessous) sans prétendre **tout contrôler ni tout prévoir** — les utilisateurs restent des humains. On **évite de sur-proceduraliser** : la procédure ne doit jamais devenir plus lourde que la fonctionnalité qu'elle protège. En cas de doute d'implémentation, préférer la solution **simple et raisonnable** au verrou exhaustif.

## Décision

### 1. Note inversée : le baromètre de confiance est **réservé au restaurateur** — miroir de l'ADR 0007

- Le **baromètre de confiance** d'un établissement — **état de santé + tendance + décomposition** actionnable, jamais une note chiffrée (§8) — agrégé à partir des retours de ses membres, est **visible uniquement côté restaurateur**. Il n'est **jamais** exposé aux membres ni au public.
- Côté membre : jamais de note d'établissement, jamais les retours des autres membres. Le membre ne voit que **ses propres** retours et l'accusé de réception / la réponse de l'établissement.
- C'est l'ADR 0007 **inversé** : là où le CA de l'établissement est caché au client, ici c'est le **baromètre qualité** qui est caché au client — mais rendu au restaurateur.

### 2. Retour **structuré** (pas de texte libre nominatif)

- **Intention d'abord (un retour = un mode, jamais mitigé)** : le membre choisit **« Encourager mon resto »** (positif → prénom visible, §4) ou **« Signaler un souci »** (négatif → anonyme, §4). Le mode **est** le sentiment et détermine l'identité — **pas de sentiment calculé, pas d'objet hybride**. Qui veut faire les deux fait **deux gestes** distincts.
- **Dimensions opérationnelles cochées, pas notées** : précision de la commande, temps d'attente, qualité / température, accueil. Un signalement **coche les axes qui ont coincé** ; **pas de note 1-5 par axe** (inutile pour repérer un goulot, et évite le faux air de *scoring* du personnel).
- **Commentaire libre optionnel**, **modéré**. L'UI **décourage explicitement** de nommer un employé ; contenu signalable / masquable.
- **Non-objectif (ligne rouge)** : aucun champ, filtre ou tableau **« par employé »** dans l'application (voir §6).

### 3. Déclencheur : le membre fidèle est invité à s'exprimer

- Après **N commandes validées** (défaut : 3), une **invitation in-app** (transactionnelle, pas marketing) propose au membre d'**encourager** l'établissement et, s'il le souhaite, d'**ajouter un commentaire**.
- Seuls les membres avec **commandes validées** (`orders` validés, ADR 0008) peuvent laisser un retour → anti-faux-avis. **Un retour rattaché à une commande**, anti-spam (rate-limit).
- L'invite est **in-app uniquement** (canal transactionnel) → pas de consentement marketing requis (ePrivacy).

### 4. Service recovery **médié par la plateforme** (le resto n'obtient jamais le contact brut)

- Sur un incident, le membre peut **être mis en relation** avec l'établissement. L'échange se fait **via un fil in-app médié par la plateforme** ; l'établissement **ne reçoit ni numéro, ni email, ni identité brute** (même principe que le ciblage-service, ADR 0022 §2).
- **Opt-in par incident** : le membre choisit, retour par retour, s'il veut être recontacté. Par défaut : pas de recontact.
- L'établissement peut **accuser réception** / répondre / remercier — toujours via la plateforme.
- **Identité affichée au resto — pseudonymisée, pilotée par le sentiment.** Le resto voit un **pseudonyme persistant** (prénom + identifiant stable), **jamais** téléphone/email. Règle : **encouragement → prénom visible** (on construit le lien) ; **plainte / incident → anonyme par défaut** (le resto voit « un membre » + contexte, sans identité). Le membre peut **toujours forcer l'anonymat**. La médiation fonctionne même anonyme : la plateforme route la réponse vers le bon membre — l'anonymat est vis-à-vis du **resto**, pas de la plateforme.

### 5. Ce que voit le restaurateur : données **opérationnelles**, pas de gestion à sa place

- **Baromètre de confiance** = **état de santé** (feu vert / orange / rouge) + **tendance** vs période précédente + **décomposition** (encouragements vs incidents, axes récurrents, taux de réponse) — **jamais une note chiffrée** ; **« pas assez de signaux »** sous un seuil de retours (§8). **Benchmark** vs pairs **anonymisés** (optionnel, seuil ≥ 20, ADR 0022).
- **Incidents individuels** avec **contexte opérationnel grossi** : **jour + créneau** (fenêtre horaire), axes cochés, commentaire éventuel — **jamais** le Bestelnummer ni l'heure à la minute (`order_id` reste **côté serveur** : anti-faux-avis / dédoublonnage, non affiché). Grossir le contexte protège l'**anonymat** de la plainte (§4). *Risque connu assumé (v1)* : dans un très petit resto sur un créneau creux, même le créneau peut ré-identifier — le masquage sous seuil d'activité est un raffinement **couche B**.
- **Regroupement des incidents par jour + créneau** (réutilise `orders.order_time` — OCR best-effort, ADR 0020 — et `order_date`, comme les pages admin `insights` / `sales` existantes) — **jamais** par personne. Quand `order_time` manque, l'incident n'est bucketisable que par **jour**. « Le vendredi 19-21 h ça coince » est actionnable sans nommer qui que ce soit.
- **L'app ne calcule PAS l'« affluence / rush »** : `orders` ne contient que les commandes-programme scannées (fraction du trafic réel) → toute affluence serait un proxy biaisé. Le **rush reste la lecture du restaurateur** (il était là), qu'il **superpose** au regroupement des incidents — strict respect du principe « on fournit la donnée, il conclut ».
- La plateforme **suggère** des lectures opérationnelles (créneaux à risque) ; elle **ne recommande jamais** d'action RH ni n'identifie d'individu.
- **Cloisonnement** : dans le canal qualité, le resto **ne voit pas** l'historique de dépenses / euros du membre (ADR 0007), et **aucun historique de plaintes rattaché à une identité** (les plaintes sont anonymes, §4) — pas de profilage du client.

### 6. Frontière juridique : la plateforme ne fait **aucune surveillance du personnel** — *À valider (juriste)*

- **Granularité par design** : dimensions **opérationnelles** (créneau, jour, type de commande). **Interdiction produit** d'ajouter une dimension / un filtre **« par employé »** : ce serait construire l'instrument de surveillance et ferait basculer la plateforme en **responsabilité conjointe** d'un traitement RH.
- **Vocabulaire** : « fiabiliser le service / repérer les créneaux tendus », **jamais** « identifier le fautif » (la finalité affichée pèse juridiquement).
- **Répartition contractuelle (CGV / DPA restaurateur)** : le restaurateur est **seul responsable-employeur** des conclusions qu'il tire sur son personnel et s'engage à respecter ses obligations de **droit social** (info-consultation CCT 39 / CCT 68, etc.) ; l'éditeur **ne réalise aucune évaluation du personnel**. C'est le vrai bouclier — « on fournit la donnée, l'usage vous appartient » ne tient que si l'outil n'est **pas conçu** pour l'usage illicite.

### 7. Bases légales & RGPD

| Finalité | Base légale | Opt-in séparé |
|---|---|---|
| Soumission d'un retour (encouragement / signalement + commentaire) | Acte **volontaire** du membre / exécution du service — *À valider* | Non (acte volontaire, informé) |
| Mise en relation / recontact sur incident | **Consentement** (opt-in par incident) | **Oui** |
| Baromètre de confiance & analytics **opérationnels** (resto) | Intérêt légitime (amélioration du service) — *À valider* | — |
| Benchmark inter-établissements | Agrégats **anonymisés**, seuil **≥ 20** (ADR 0022) | — |

- **Nouvelle finalité** au **registre des traitements** (Art. 30) + **paragraphe** dédié dans la politique de confidentialité (`/privacy`).
- Les retours sont des **données personnelles du membre** → inclus dans l'**export** (ADR 0022 §6) et l'**effacement / anonymisation** (le commentaire est anonymisé / supprimé ; l'incident peut rester en **statistique opérationnelle non nominative**).
- Poids **AIPD** fortement réduit tant que §6 est respecté (pas de suivi systématique du personnel) — **à confirmer**.

### 8. Forme du baromètre & robustesse (anti-gaming)

- **Pas de note chiffrée.** Le baromètre = **état de santé** (vert / orange / rouge) + **tendance** (progresse / se dégrade vs période précédente) + **décomposition** actionnable (encouragements vs incidents, axes récurrents, **taux de réponse** aux incidents). Message : « où ça grince et si tu t'améliores », pas « ta note est X » — un **outil**, pas un **bulletin**.
- **Démarrage à froid** : sous un seuil de retours → **« pas assez de signaux »** (jamais un « 0 » anxiogène ni un « 100 » bidon).
- **Pondération** : récence + volume de commandes validées ; un incident isolé ne fait pas basculer l'état.
- Retours **rattachés à des commandes validées** → un établissement ne peut pas gonfler artificiellement, un tiers ne peut pas saboter.

## Périmètre v1 / suite

- **v1 (couche A)** : §1–§5 + §7–§8 — retour structuré, baromètre réservé au resto, service recovery médié, analytics **opérationnels**.
- **Différé (couche B)** : granularité opérationnelle plus fine (heatmaps de créneaux d'incidents) ; **masquage des incidents sous un seuil d'activité** de créneau (anti ré-identification petits nombres, §5). **Hors périmètre définitif** : toute attribution **nominative** par employé dans l'app (§6).

## Conséquences sur le schéma & le code (pour l'agent d'implémentation)

- **Nouvelles tables** :
  - `quality_feedback` : `id, user_id, restaurant_id, order_id (nullable), sentiment ('encouragement'|'incident'), dimensions TEXT[] (axes cochés sur un incident : accuracy|wait|quality|welcome), comment TEXT nullable, is_anonymous BOOLEAN (défaut : true si incident, false si encouragement ; le membre peut forcer true), contact_opt_in BOOLEAN, occurred_at, created_at, status ('new'|'acknowledged'|'resolved'), moderation_status`.
  - `feedback_messages` : fil médié `(id, feedback_id, restaurant_id, sender 'member'|'establishment', body, channel, created_at)` — **le resto n'a jamais le contact brut**.
- **Baromètre / analytics** : vue / calcul du baromètre (`restaurant_trust_barometer`, agrégat pondéré → **état + tendance + décomposition**) ; regroupement des incidents **par créneau / jour** — réutilise la machinerie existante (`order_time` + `order_date`, pages admin `insights` / `sales`). **Pas** de métrique « affluence / rush » ; **aucune** colonne ni JOIN par employé.
- **RLS** : `quality_feedback` et `feedback_messages` = **service-role only** (données personnelles) ; le membre lit / édite **ses** retours ; l'établissement y accède **côté serveur**, borné à **son** `restaurant_id` (jamais les autres établissements — ADR 0015) et **réservé à l'owner** (`isOwner`, `admin-guard.ts`) — pas les écrans de comptoir partagés.
- **Écrans membre** : invite in-app après N commandes ; formulaire de retour **structuré** + commentaire optionnel ; « Encourager mon resto » ; fil de service recovery (si opt-in). **Aucun** baromètre d'établissement affiché (§1).
- **Écrans resto** : baromètre (**état + tendance + décomposition**) ; liste d'incidents avec contexte opérationnel grossi ; regroupement par créneau / jour ; réponse médiée. **Aucun** filtre par employé (§6).
- **APIs** : `POST /api/feedback` (créer), `GET /api/feedback/me` (mes retours), admin `GET /api/admin/feedback` (borné resto), `POST /api/admin/feedback/[id]/reply` (médié).
- **Migration** `docs/mNN-quality-feedback.sql` (tables + RLS service-role) ; format non-cassant, idempotent ; **build vert**.
- **Export / effacement** (ADR 0022) : étendre `lib/gdpr.ts` pour inclure / anonymiser `quality_feedback` + `feedback_messages`.

## Points à valider par un juriste (obligatoire avant commercialisation)

1. Base légale de la **soumission de retour** et des **analytics opérationnels** (consentement vs intérêt légitime).
2. Confirmation que la **granularité opérationnelle** (créneau / jour, **sans** dimension personnel) **écarte** la qualification de traitement RH / responsabilité conjointe.
3. Clause **CGV / DPA restaurateur** répartissant la responsabilité employeur.
4. Modération des **commentaires** (diffamation, données de tiers) et procédure de retrait.
5. Traitement des retours dans l'**effacement** (anonymisation du commentaire vs conservation de la statistique).

## Alternatives rejetées

- **Note publique (modèle Google)** : rejetée — c'est exactement ce que la feature veut éviter (exposition, irréversibilité).
- **Attribution nominative par employé dans l'app** : rejetée — surveillance du personnel, bascule en HR-tech réglementée ; laissée à l'appréciation **hors app** du restaurateur (§6).
- **Contact direct resto ↔ client (contact transmis)** : rejetée — le recontact reste **médié par la plateforme** (cohérent ADR 0022), le membre garde la main (opt-in).
- **Texte libre seul** : rejeté au profit d'un **retour structuré** + commentaire optionnel (signal exploitable, risque réduit).
- **Entonnoir / *review gating* (router les mécontents loin de Google, les contents vers Google)** : rejeté — contraire à la politique Google et risqué en droit de la consommation. Le canal qualité privé et la micro-récompense « avis Google » restent **strictement indépendants** ; aucun aiguillage selon le sentiment.
- **« Score de confiance » (note chiffrée unique)** : rejeté — recrée l'angoisse d'une note qui juge (côté resto cette fois), peu actionnable, et « score » entre en **collision** avec le *score communautaire* (CONTEXT.md). Remplacé par le **baromètre** (état + tendance + décomposition).
