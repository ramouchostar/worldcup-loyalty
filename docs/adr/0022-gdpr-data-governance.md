# ADR 0022 — Conformité RGPD, rôle de responsable de traitement & gouvernance des données

**Statut** : Proposé — **implémentable en l'état** ; les points marqués « À valider (juriste) » doivent être confirmés par un avocat / DPO spécialisé RGPD (Belgique) **avant commercialisation**. Ceci est une décision d'architecture, pas un avis juridique.

## Contexte

La plateforme est une application de fidélité **multi-établissement** (ADR 0015) qui collecte des données personnelles de membres : identité (prénom), coordonnées (téléphone, email), **historique de dépenses**, appartenance à une ou plusieurs équipes (`memberships`), **zones** domicile/travail/école (ADR 0018), abonnements push, numéros WhatsApp. Elle **envoie du marketing** (broadcasts push/WhatsApp, ADR 0014) et vise à **monétiser la donnée** via des fonctionnalités payantes destinées aux restaurateurs.

Cadre applicable : **RGPD** + directive **ePrivacy** (marketing électronique) + droit belge. Autorité compétente : **APD/GBA** (Autorité de protection des données).

Deux décisions du porteur de projet sont actées : (1) l'éditeur est **responsable de traitement** ; (2) les **mineurs** nécessitent un **consentement parental**.

## Décision

### 1. Rôle : l'éditeur est **responsable de traitement unique**

- L'éditeur de la plateforme est **seul responsable de traitement** des données des membres.
- Les **restaurateurs sont des clients-utilisateurs** d'un service, **ni responsables ni sous-traitants** des données membres de la plateforme. Ils **n'accèdent jamais aux données brutes** des membres des autres établissements.
- Un restaurateur accède uniquement à : (a) les membres inscrits à **son propre** programme (base contractuelle), (b) des **insights agrégés/anonymisés**, (c) un **outil de ciblage** exécuté par la plateforme.

### 2. Ce qui est commercialisé : audience + insights, **sans cession de données brutes** — *À valider (juriste)*

La « vente de données » se fait **sans transférer aucune donnée personnelle brute** :

- **Insights agrégés & anonymisés** (fonctionnalité payante) : statistiques par type d'équipe, par zone, tendances temporelles — **jamais à l'échelle individuelle**. Règle technique obligatoire : **seuil d'agrégation** — n'exposer une statistique que si le segment compte **≥ 20 membres** (protection contre la ré-identification / k-anonymat). En dessous du seuil : statistique masquée.
- **Ciblage-service** (fonctionnalité payante) : le restaurateur choisit un segment (« toutes les écoles de ma zone »), la **plateforme exécute** l'envoi ; le restaurateur **ne reçoit ni identités, ni numéros, ni liste nominative**.
- **Données de ses propres membres** : un restaurateur voit les membres de **son** programme (ceux qui ont rejoint via lui) — jamais ceux des autres établissements.

> Le besoin commercial (« toucher et comprendre son audience ») est ainsi couvert **sans céder de données personnelles** — ce qui est à la fois conforme et défendable. La qualification exacte et la base légale de la commercialisation d'insights **doivent être validées par un juriste**.

### 3. Bases légales par finalité

| Finalité | Base légale | Consentement séparé (opt-in) |
|---|---|---|
| Compte membre + programme de fidélité | Exécution du contrat | Non (mais information claire) |
| Notifications marketing (push / WhatsApp, broadcasts) | **Consentement** (ePrivacy) | **Oui** |
| Insights commerciaux / inclusion dans les agrégats vendus | **Consentement explicite** | **Oui** (distinct) |
| Zones (découverte d'équipes) | Consentement / nécessaire au service | **Oui** |

### 4. Modèle de consentement (à implémenter)

- Table `consents` : `(user_id, purpose, granted BOOLEAN, policy_version, source, created_at)`. Finalités (`purpose`) : `programme`, `marketing_push`, `marketing_whatsapp`, `insights_commerciaux`, `zones`.
- Consentements **granulaires, indépendants, révocables à tout moment** (écran Paramètres > Confidentialité).
- **Journal d'audit** conservant l'historique (preuve : qui a consenti à quoi, quand, sous quelle **version de politique**). Ne jamais écraser — ajouter une nouvelle ligne à chaque changement.
- **Re-consentement** exigé en cas de changement matériel de la politique de confidentialité.
- **Garde-fous applicatifs (obligatoires)** : une finalité sans consentement = fonctionnalité **désactivée** pour ce membre.
  - `lib/broadcast.ts` : **exclure** les membres sans `marketing_push` / `marketing_whatsapp` du canal concerné.
  - Insights vendus : **exclure** les membres sans `insights_commerciaux` **et** appliquer le seuil d'agrégation (§2).

### 5. Mineurs — consentement parental

- Collecter la **date de naissance** (ou une porte d'âge) à l'inscription.
- **Âge du consentement numérique en Belgique : 13 ans.** Si le membre est **en dessous** : **consentement parental requis** — flux : saisie de l'**email d'un parent** → email de confirmation → compte en **attente** (fonctionnalités limitées) tant que le parent n'a pas confirmé.
- Champs `profiles` : `birth_date`, `is_minor`, `parental_consent_status` (`none|pending|granted`), `parental_email`.
- Information explicite dans l'UI et la politique. *À valider (juriste)* : niveau de vérification parentale exigé.

### 6. Droits des personnes (à implémenter)

- **Accès + portabilité** : `GET /api/me/export` → export **JSON** de toutes les données du membre.
- **Effacement** : `POST /api/me/delete` → suppression **ou anonymisation** des données personnelles. Les données à **conservation légale** (pièces liées à la comptabilité) sont **anonymisées/pseudonymisées**, pas conservées nominativement.
- **Rectification** : édition du profil.
- **Retrait de consentement / opposition** : bascules dans Paramètres.
- **Délai légal** : répondre sous **1 mois**. Tracer les demandes (`data_requests`).
- **Périmètre de l'effacement** (à couvrir intégralement) : `profiles`, `memberships`, `orders` (anonymiser si conservation comptable), `pending_rewards`, `redemption_tokens`, `push_subscriptions`, `notification_log`, `referral_links` / `referrals`, `consents`, zones, réserve de points personnelle (ADR 0021), et toute autre table portant `user_id`.

### 7. Minimisation & conservation

- Ne collecter que le strict nécessaire par finalité (la date de naissance sert au contrôle d'âge, pas à autre chose).
- **Durées de conservation** (défauts — *à valider avec juriste/comptable*) :
  - Pièces comptables / preuves d'achat (`orders`, reçus) : **7 ans** (droit comptable belge) puis anonymisation.
  - Données marketing/comportementales : supprimées à la clôture du compte ou après **24 mois d'inactivité**.
  - Journaux de notification : **12 mois**.
  - **Agrégats anonymisés / statistiques historiques : conservation ILLIMITÉE** — une fois anonymisées, ces données ne sont plus personnelles (hors champ RGPD). C'est ce qui permet aux restaurateurs d'analyser l'évolution dans le temps et de **relancer ce qui a marché**, sans conserver de données identifiantes. C'est la façon conforme de répondre au besoin de « conservation la plus longue possible ».
- **Job de purge** planifié : anonymise/supprime les données **personnelles** selon les durées ci-dessus, tout en **préservant l'historique agrégé anonymisé**.

### 8. Sécurité & traçabilité

- **Acquis** : TLS, RLS par établissement, mots de passe hachés (Supabase Auth), masquage des euros/CA côté client (ADR 0007), chiffrement au repos (Supabase).
- **À ajouter** :
  - **Procédure de violation de données** : notification à l'APD **sous 72 h**, information des personnes si risque élevé.
  - **Journal d'audit** des accès/exports/suppressions de données personnelles.
  - **Hébergement en région UE** (projet Supabase EU + déploiement Vercel EU) — vérifier et documenter tout transfert hors UE.
  - **Contrats de sous-traitance (DPA)** signés avec chaque sous-traitant : Supabase, Vercel, Meta/WhatsApp, fournisseur push.

### 9. Transparence

- Page **Politique de confidentialité** publique et **versionnée** (`/privacy`), présentée à l'inscription (case liée à la version acceptée).
- Page **CGU** (`/terms`) ; **CGV** distinctes pour les restaurateurs.
- **Registre des traitements** (Art. 30) maintenu à jour (document hors code).

## Conséquences sur le schéma & le code (pour l'agent d'implémentation)

- **Nouvelles tables** : `consents`, `data_requests` (`user_id, type export|deletion, status, requested_at, completed_at`), `audit_log` (optionnel mais recommandé).
- **Colonnes `profiles`** : `birth_date`, `is_minor`, `parental_consent_status`, `parental_email`, `anonymized_at`.
- **Migration** : `docs/mNN-gdpr.sql` (tables + colonnes + RLS service-role sur `consents`/`audit_log`).
- **Écrans** : consentements granulaires à l'inscription (`register`) ; **Paramètres > Confidentialité** (bascules + export + suppression) ; bannière de re-consentement ; page `/privacy` + `/terms`.
- **Garde-fous** : `lib/broadcast.ts` filtre par consentement marketing ; module d'insights filtre par consentement + seuil d'agrégation ≥ 20.
- **APIs** : `/api/me/export`, `/api/me/delete`, `/api/consents` (lire/mettre à jour).
- Conserver le **build vert** et écrire les migrations au format `docs/mNN-*.sql` (non-cassantes, idempotentes).

## Points à valider par un juriste (obligatoire avant commercialisation)

1. Qualification « responsable unique » + le fait que les restaurateurs n'accèdent qu'à des agrégats/ciblage (pas de cession de données brutes).
2. Base légale et licéité de la **commercialisation d'insights**, même agrégés.
3. **Seuil et méthode d'anonymisation** (le ≥ 20 est un défaut prudent, à confirmer).
4. **Flux mineurs** et niveau de vérification du consentement parental.
5. **Durées de conservation** (comptable belge) et articulation avec le droit à l'effacement.
6. Nécessité d'une **AIPD/DPIA** (probable : profilage + localisation + marketing ciblé) et d'un **DPO**.

## Alternatives rejetées

- **Co-responsabilité éditeur / restaurateurs** : rejetée — complexité contractuelle et ambiguïté ; l'éditeur reste **seul responsable**.
- **Cession de données personnelles brutes aux restaurateurs** : rejetée — risque juridique majeur et **inutile** : le ciblage-service et les insights agrégés répondent au besoin commercial sans transférer de donnée personnelle.
