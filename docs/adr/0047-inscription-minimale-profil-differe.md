# ADR 0047 — Inscription minimale : e-mail + mot de passe + consentement, profil différé

**Statut** : Accepté — implémenté (2026-09-01). Étape 05/10 du backlog onboarding.

## Contexte

L'inscription demandait **neuf champs** (prénom, nom, e-mail, téléphone, date de
naissance, trois zones, mot de passe ×2) — debout au comptoir, sur téléphone. Pire :
`/register` (complétion de profil forcée post-authentification) **redemandait les
mêmes informations** (prénom, naissance, zones), soit tout en double pour un inscrit
e-mail. Et l'inscription e-mail ne comportait **aucune case de consentement** (les
consentements ADR 0022 n'étaient actés que sur /register — que les inscrits e-mail
avec profil complet sautaient).

## Décision

1. **`/signup` tient en trois éléments** : e-mail, mot de passe (simple, 6 caractères
   min, sans confirmation), et **une case de consentement obligatoire** (politique de
   confidentialité + CGU + attestation « au moins 13 ans ou l'accord d'un parent »).
   Google OAuth inchangé. Le consentement coché part dans les **métadonnées** du
   compte (`accept_policy`, horodaté) — il est acté côté serveur (journal `consents`,
   ADR 0022, source `signup`) au premier passage dans `auth/callback`, ce qui couvre
   aussi le parcours « confirmation par e-mail ».
2. **Le garde d'entrée n'est plus le prénom mais le consentement.** `auth/callback`
   ne redirige vers `/register` que si le consentement `programme` manque ET que les
   métadonnées ne le portent pas — en pratique : les arrivées **Google OAuth** (une
   fois), et les comptes historiques sans consentement journalisé (mise en conformité
   au passage, un seul écran, une seule case).
3. **`/register` est réduit à cette case unique** (« Dernière étape ») — plus aucun
   champ de profil. L'action `acceptProgramme` remplace `registerProfile` et conserve
   toute la chaîne de reprise (invitation restaurateur, become-a-partner, resto/ticket
   en attente — ADR 0032/0040).
4. **Prénom, zones et date de naissance sont demandés là où ils servent** :
   - carte **« Mon profil »** dans `/compte` (tout facultatif, chaque champ dit son
     usage : prénom → « pour qu'on t'écrive autrement que "toi" », zones → équipes
     proches, naissance → 🎂 anniversaire) ;
   - **zones** : bandeau sur « Mon équipe » quand elles manquent (c'est le moment où
     elles servent — les suggestions de communautés du resto, ADR 0031, fonctionnent
     déjà sans zones) ;
   - **date de naissance** : facultative ; si elle révèle un mineur (< 13 ans),
     le consentement parental ADR 0025 se déclenche à ce moment-là (e-mail d'un
     parent requis, statut `pending`). L'attestation d'âge à l'inscription couvre
     l'entre-deux.
   - Les e-mails utilisent déjà « toi » en absence de prénom (aucun changement).
5. **Opt-ins facultatifs** (offres, statistiques anonymisées) : plus jamais dans le
   tunnel — ils vivent dans `/compte` (PrivacySettings, ADR 0022), où ils étaient
   déjà gérables.

## Conséquences

- Le tunnel comptoir complet devient : scan QR → photo du ticket → e-mail + mot de
  passe + case (ou Google, + une case) → ticket envoyé. Plus aucune redemande.
- `member_profile_completed` (analytics) n'est plus émis que sur `/register`
  (consentement OAuth) avec `zones_count: 0` — le funnel d'inscription se lit sur
  `sign_up`.
- Les comptes historiques sans consentement journalisé verront `/register` (une
  case) à leur prochaine connexion — mise en conformité ADR 0022 assumée.
- Le trigger `handle_new_user` (m29) tolère déjà l'absence de métadonnées profil.
