# ADR 0038 — Un second chemin vers l'installation de l'app

**Statut** : Accepté (2026-08-21). Complète l'**ADR 0030** (cohérence de navigation, parcours par rôle) et l'**ADR 0032** (lien d'invitation restaurateur). Ne change rien à l'**ADR 0009** (notifications push, qui dépendent de l'installation). **Complété le 2026-08-22 — mesure** : l'incitation existait, pas la mesure (`pwa_installed` déclaré mais jamais émis ; rien en base ; GA4 aveugle sur iOS et sous consentement). Signal retenu : *l'app s'ouvre en mode installé* (`display-mode: standalone` / `navigator.standalone`), remonté une fois par session par `AppInstallBeacon` → `/api/me/app-install` → table `member_app_installs` (migration `docs/migrations/20260822-2023-member-app-installs.sql`, service-role, exportée/effacée avec le compte). Visible : colonne « App » sur `/platform/members`, tuile « App installée » sur `/platform/stats`, 📱 pseudonymisé sur « Mes clients ». `pwa_installed` GA4 est désormais émis sur `appinstalled` (agrégat Android, sous consentement). Non rétroactif.

## Contexte

L'installation de l'app n'était proposée qu'à un seul instant, et cet instant ne se représente jamais.

**Côté membre** : l'onboarding (`OnboardingFlow`) pose la question au premier passage, juste après le scan du QR. Qui répond « plus tard », ferme l'écran, ou arrive au comptoir avec quelqu'un qui attend derrière lui, n'a plus aucun chemin — la question ne revient pas.

**Côté restaurateur** : rien du tout. Il arrive par un lien d'invitation (ADR 0032), atterrit directement dans sa console, et personne ne lui a jamais dit que l'app s'installe. Il valide donc ses tickets depuis un onglet de navigateur, avec les notifications qui vont avec, c'est-à-dire aucune.

Or l'installation n'est pas un confort : c'est ce qui rend les **notifications push** possibles (ADR 0009), donc tout le rappel proactif — le cœur du programme. Un membre non installé est un membre qu'on ne peut plus toucher qu'en magasin.

Le navigateur n'aide pas : `beforeinstallprompt` ne part qu'une fois par chargement, seulement sur Chrome/Android, et **jamais sur iOS** — où l'installation existe pourtant, mais uniquement à la main.

## Décision

### 1. Un espace permanent, pas une relance

`InstallAppCard` s'affiche **tant que l'app n'est pas installée**, et disparaît d'elle-même une fois qu'elle l'est (`display-mode: standalone`, ou `navigator.standalone` sur iOS). Rien à masquer, aucun réglage à retenir, aucune relance à programmer : c'est un endroit, pas un rappel.

Trois chemins selon ce que le navigateur permet :

| Situation | Ce qu'on montre |
|---|---|
| `beforeinstallprompt` capté | un bouton « Installer l'app » |
| iOS Safari | les deux gestes : Partager ⬆️ → « Sur l'écran d'accueil » |
| autre (Firefox, bureau…) | le chemin manuel par le menu du navigateur |

Le troisième cas est le plus facile à oublier : sans lui, un visiteur sur un navigateur non-Chromium voit un espace vide ou rien du tout.

### 2. Deux surfaces, deux voix

- **Dashboard membre** (`/r/[id]/dashboard`), en bas : tutoiement, l'argument est le cadeau et la notification.
- **Console restaurateur** (`/admin/[id]`), en haut : vouvoiement, l'argument est valider ses tickets sans passer par le navigateur.

Le haut pour le restaurateur parce qu'il ne redescendra pas ; le bas pour le membre parce que son dashboard commence par ce qu'il a gagné, et qu'on ne coupe pas cette lecture.

### 3. Le premier accès du restaurateur porte une marque

`acceptInvite` (ADR 0032) redirige désormais vers `/admin/[id]?bienvenue=1`. La carte y prend un ton d'accueil au lieu de se fondre dans la console d'un habitué. C'est la seule différence : même composant, même comportement.

### 4. Jamais deux fois la même question sur le même écran

Côté membre, la carte **se tait tant que l'étape d'onboarding est encore due**. Les deux surfaces partagent les mêmes clés (`pwa_prompted`, `pwa_snoozed_until`, exportées par `lib/pwa-install.ts`) pour que la règle ne puisse pas diverger. L'ordre est : l'onboarding d'abord, la carte ensuite — le second chemin, pas un doublon du premier.

## Conséquences

- La mesure distingue les deux moments : `pwa_installed` (installation acceptée, inchangé) et `pwa_install_prompted` (`audience`, `surface`) qui compte le rattrapage. On saura si cet espace sert, ou s'il décore.
- L'ancien `components/InstallBanner.tsx` — écrit, jamais monté nulle part, sans chemin iOS — est supprimé : il aurait fait un deuxième comportement à maintenir.
- Le module `lib/pwa-install.ts` capte `beforeinstallprompt` au chargement, avant React. C'est nécessaire : attendre un `useEffect`, c'est rater l'événement.

## Alternatives rejetées

**Reposer l'étape d'onboarding au bout de N jours.** Une relance modale sur un écran qu'on n'a pas demandé est une interruption ; l'installation n'est pas assez urgente pour ça. Un endroit stable se consulte quand on en a envie.

**Une bannière fermable.** Fermée une fois, elle repose le problème du premier jour : plus aucun chemin. Ce qui doit disparaître, c'est l'installation faite — pas le fait de l'avoir refusée.

**Attendre `beforeinstallprompt` avant de rien montrer.** C'est l'état actuel côté restaurateur, et c'est exactement ce qui laisse tout iOS de côté.
