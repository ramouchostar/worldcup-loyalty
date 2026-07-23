# Registre des activités de traitement (RGPD, article 30)

**Responsable du traitement :** [NOM DE LA SOCIÉTÉ] — [adresse], Belgique — BCE [Nº] — contact vie privée : [email].
**DPO :** [le cas échéant — sinon « non désigné à ce stade, contact vie privée ci-dessus »].
**Dernière mise à jour :** [DATE] — **Version 1.0.**

> Document interne de conformité (Art. 30 RGPD). À maintenir à jour à chaque nouvelle finalité ou nouveau sous-traitant. À faire valider par un juriste / DPO.

---

## T1 — Gestion des comptes membres & programme de fidélité
- **Personnes concernées :** membres de l'application.
- **Données :** prénom, email et/ou téléphone, date de naissance (contrôle d'âge), identifiant de compte, appartenance aux établissements et équipes (`memberships`).
- **Base légale :** exécution du contrat (art. 6.1.b).
- **Destinataires / sous-traitants :** hébergeur base de données & application (UE).
- **Transferts hors UE :** aucun (hébergement UE).
- **Conservation :** durée de vie du compte, puis suppression/anonymisation après [24] mois d'inactivité.
- **Sécurité :** TLS, chiffrement au repos, RLS par établissement, mots de passe hachés.

## T2 — Fonctionnement des équipes & calcul des récompenses
- **Personnes concernées :** membres.
- **Données :** commandes validées et montants, lignes de ticket, scores d'équipe, réserve de points (`point_transactions`), récompenses en attente.
- **Base légale :** exécution du contrat.
- **Destinataires :** hébergeur (UE). L'établissement voit **ses** membres et les cadeaux à remettre, pas les données des autres établissements.
- **Transferts hors UE :** aucun.
- **Conservation :** pièces liées aux achats/comptabilité [7] ans (obligation légale), puis anonymisation.
- **Sécurité :** idem T1 + masquage des euros/CA côté membre (règle produit ADR 0007).

## T3 — Notifications marketing (offres des établissements)
- **Personnes concernées :** membres **ayant donné leur consentement**.
- **Données :** identifiant de compte, jeton d'appareil (push), numéro (WhatsApp), appartenance/type d'équipe et zone (ciblage).
- **Base légale :** **consentement** (art. 6.1.a) + ePrivacy.
- **Destinataires / sous-traitants :** fournisseur de notifications push ; Meta/WhatsApp (si canal accepté).
- **Transferts hors UE :** possibles via WhatsApp/Meta — encadrés par clauses contractuelles types.
- **Conservation :** jusqu'au retrait du consentement ou clôture du compte ; journaux d'envoi [12] mois.
- **Sécurité :** idem T1 ; envoi exécuté par la plateforme (l'établissement ne reçoit aucune coordonnée).

## T4 — Statistiques agrégées & anonymisées (insights commerciaux)
- **Personnes concernées :** membres **ayant donné leur consentement** (avant anonymisation).
- **Données :** données de fréquentation/dépense **agrégées** par type d'équipe, zone, période. **Seuil d'agrégation : ≥ 20 membres** (anti-ré-identification).
- **Base légale :** **consentement** pour l'inclusion ; les agrégats anonymisés sortent ensuite du champ du RGPD.
- **Destinataires :** établissements (agrégats uniquement, jamais de données individuelles).
- **Transferts hors UE :** aucun.
- **Conservation :** données personnelles source selon T1/T2 ; **agrégats anonymisés : illimité**.
- **Sécurité :** anonymisation + seuil ; exclusion des membres sans consentement.

## T5 — Découverte d'équipes par zone
- **Personnes concernées :** membres.
- **Données :** zone(s) déclarée(s) (domicile ; travail/école facultatifs).
- **Base légale :** consentement / nécessaire au service.
- **Destinataires :** hébergeur (UE).
- **Transferts hors UE :** aucun.
- **Conservation :** durée de vie du compte.
- **Sécurité :** idem T1.

## T6 — Sécurité, prévention de la fraude & journalisation
- **Personnes concernées :** membres.
- **Données :** journaux de connexion, identifiants techniques, indicateurs anti-doublon/anti-fraude sur les tickets.
- **Base légale :** intérêt légitime (art. 6.1.f) — sécurité du service.
- **Destinataires :** hébergeur (UE).
- **Transferts hors UE :** aucun.
- **Conservation :** [12] mois.
- **Sécurité :** journal d'audit, accès restreint (service role).

## T7 — Gestion des demandes d'exercice de droits
- **Personnes concernées :** membres exerçant leurs droits.
- **Données :** identité, objet de la demande (accès/effacement/portabilité), suivi (`data_requests`).
- **Base légale :** obligation légale (art. 6.1.c) — répondre sous 1 mois.
- **Conservation :** preuve du traitement de la demande [3] ans.
- **Sécurité :** vérification d'identité, journal d'audit.

## T8 — Comptabilité & obligations légales
- **Personnes concernées :** membres (via preuves d'achat).
- **Données :** montants et pièces liées aux commandes.
- **Base légale :** obligation légale (art. 6.1.c).
- **Conservation :** **[7] ans** (droit comptable belge) puis anonymisation.
- **Sécurité :** idem T1.

---

**Points transverses à valider (juriste/DPO) :** nécessité d'une AIPD/DPIA (profilage + localisation + marketing ciblé — probable) ; désignation éventuelle d'un DPO ; liste et signature des accords de sous-traitance (DPA) ; vérification des régions d'hébergement UE.
