# ADR 0073 — Le format de la clé du ticket : ce qui existe, et rien d'autre

**Statut** : Accepté (2026-09-29) — décisions du porteur : De Bue en « forme seule », refus net d'un
ticket d'un autre établissement, liste en lecture seule pour l'existant. Complète l'[ADR 0019](0019-receipt-key-discovery.md)
(la clé est définie par établissement), l'[ADR 0052](0052-dedoublonnage-par-empreinte-de-ticket.md) (anti-doublon),
l'[ADR 0058](0058-le-ticket-ne-se-corrige-pas.md) (lecture incomplète = nouvelle photo) et précise le
déclencheur de relecture de l'[ADR 0072](0072-sonnet-lit-fable-relit.md) §2. Appliqué avec le bouclier de l'[ADR 0065](0065-le-bouclier-scene-trace-echos.md).

## Contexte

La clé de commande imprimée par les bornes (`AAAA-MM-JJ/223/01645`) était contrôlée par un motif écrit
avant d'avoir vu des tickets : `AAAA-MM-JJ/NNN/NNNNN`, cinq chiffres exactement, n'importe quel code
au milieu. Le 2026-09-29, 199 photos de vrais tickets (Kraainem 184, Houba 15) ont été lues par
quatre modèles, dont trois s'accordent presque toujours, puis comparées à la base de production.

**1. Le motif refuse des tickets réels.** 149 clés lues : 128 photos à 5 caractères, 18 à 4, 3 à 3 —
soit **4 tickets distincts sur 93** à clé courte (`…/223/0121`, `…/258/036`), lues à l'identique par
Sonnet, Opus et Fable, **3 sur 3 confirmées à l'œil**. Ces tickets partaient en « numéro non lu ».

**2. Le dernier groupe a une forme précise.** Toujours un « 0 » en tête (149 sur 149), jamais un 0 en
deuxième position (**0 sur 92** clés distinctes ; Haiku en produisait 5 sur 141, des zéros ajoutés à tort
ou des chiffres perdus : 16 des 17 désaccords de longueur entre lecteurs). Valeurs de 36 à 9 801, réparties
sur toute la plage, **non ordonnées dans le temps** (le même jour elles montent et descendent) : ce n'est pas
un compteur, c'est un nombre de 10 à 9 999 précédé d'un 0, jamais complété par des zéros — d'où 3, 4 ou 5
caractères.

**3. Le code du milieu est celui de l'établissement.** 223 pour Kraainem (133 photos), 258 pour Houba
(15 sur 15). Rien ne le vérifiait :
- un ticket de **Houba** (`2026-09-17/258/06897`, photo T135, l'écran de la tablette montre le programme de
  Houba) a été **validé à Kraainem** ;
- sur les commandes **déjà validées** à Kraainem, 12 sur 82 portent un code qui ne peut pas être le sien
  (235, 262, 228, 123, 206, 225, 221, 031, et 258 quatre fois) ;
- sur 122 photos où l'on peut comparer la clé en base et l'accord des trois modèles, **30 diffèrent (25 %)** :
  15 fois sur le code, 25 fois sur le dernier groupe. Pour les 17 commandes à regarder (audit en lecture
  seule), **10 des 11 comparables ont une clé fausse en base** ; la onzième est le ticket de Houba.

**4. La consigne contaminait Haiku.** L'exemple `2026-06-01/258/03993` figurait dans la description de la
clé des trois établissements et dans le JSON-modèle : 258 est le code de Houba. Haiku l'a écrit à
Kraainem (`258/04843` lu, `223/06655` réel) et a recopié « 03993 » sur T008.

**Ce que cette mesure ne dit pas** : 92 clés distinctes, deux établissements ; aucun ticket de De Bue ;
aucune clé de 6 caractères vue (la valeur maximale est 9 801, on approche de 10 000 sans qu'on sache
ce que la borne imprimerait) ; « 0 puis un nombre non complété » est déduit des tickets, pas d'une
documentation de la caisse ; les tickets sont dupliqués (certains photographiés 15 fois).

## Décision

### 1. La forme : « 0 », un chiffre de 1 à 9, puis 1 à 3 chiffres

`^(\d{4}-\d{2}-\d{2})/\d{3}/0[1-9]\d{1,3}$` (`TICKET_KEY_PATTERN`, `lib/receipt-config.ts`) — 3 à 5
caractères. Refusés : un zéro ajouté (`00121`, `0036`), une lettre (`0701B`), pas de 0 en tête, 2 ou 6
caractères. C'est le motif de la config de chaque établissement réel (migration 20260929-1100) et du
repli sans config.

### 2. Le code de l'établissement se fige, par établissement

Nouvelle colonne `restaurant_receipt_config.store_code` : **223 Kraainem, 258 Houba, NULL pour De Bue**
(aucun ticket observé : forme seule, le code se fige dès qu'un ticket est lu et confirmé à l'œil). Le
moteur de motif reste générique (le code n'est pas dans le regex : il faut pouvoir répondre « d'un autre
établissement » plutôt que « reprends la photo »). `lib/receipt-key-store.ts` :
- code = celui de l'établissement → la clé est gardée ;
- code = celui d'un **autre** établissement du réseau → **refus net** (§3) ;
- code que **personne** n'utilise (228, 262…) → lecture presque sûrement fausse : Fable relit (§4), et
  si le code reste faux, le membre reprend la photo ;
- pas de `store_code` (De Bue, colonne absente) → aucun contrôle, la forme seule est vérifiée (fail-open).

### 3. Un ticket d'un autre établissement est refusé, sans nommer l'autre

« Ce ticket ne vient pas de {établissement}. Le programme ne compte que les tickets de l'établissement où
tu es. » Refaire la photo n'y changerait rien, on ne demande donc pas de recadrer. Le message ne nomme
jamais l'autre établissement (ADR 0025). Motif d'entonnoir `wrong_establishment`. Le scan est conservé
(`header_rejected`) pour l'audit ; l'image aussi, 30 jours.

### 4. La relecture par Fable suit la clé « inutilisable » (précise l'ADR 0072 §2)

Avant : pas de relecture si une clé était lue mais refusée. Maintenant qu'une clé courte valide n'est plus
refusée, une clé de mauvaise forme ou de code inconnu est presque sûrement une **lecture fausse** : Fable
relit. Seule une clé d'un **autre établissement** ne déclenche rien (elle est bien lue). Le motif
`key_code_unknown` compte ces refus à part.

### 5. La consigne ne porte plus de code d'exemple

Description sans code (« un nombre qui commence toujours par 0… 3 à 5 caractères, ne jamais le compléter
avec des zéros, ne jamais ajouter ni retirer un chiffre »), gabarit `YYYY-MM-DD/NNN/0NNNN` dans le JSON,
`key_examples` vide. Pas d'exemple avec le bon code non plus : il ferait lire « 223 » à un ticket de Houba
et cacherait justement l'écart que §3 veut voir. Le prompt de découverte à l'onboarding n'imprime plus
d'exemple d'un autre restaurant.

### 6. L'existant : une liste, rien n'est corrigé

Les 17 commandes déjà validées dont la clé ne colle pas sont listées en lecture seule (identifiant, date,
statut, montant, clé en base, clé lue par les gros modèles quand la photo existe) — décision au cas par cas
du porteur. **Aucune correction automatique** : ce sont des données validées, des points ont été crédités.

## La trace (bouclier)

- Motifs d'entonnoir `wrong_establishment` et `key_code_unknown` (`funnel_events`, sans migration : le
  vocabulaire est ouvert) ; `ocr_trace.key_issue` sur chaque scan, affiché sur `/platform/scans`.
- Requêtes de suivi dans la migration. **Ce qui dira que la règle est fausse** :
  - un ticket **légitime** refusé « autre établissement » ou « code inconnu » (signalement d'un gérant, ou
    `key_code_unknown` qui monte sans que les photos soient mauvaises → une **nouvelle borne** avec un autre code) ;
  - des refus « numéro non lu » qui **ne baissent pas** après le 2026-09-30 ;
  - une clé de **6 caractères** (le nombre atteint 10 000) : elle serait refusée — c'est le premier signe à guetter ;
  - des **doublons** de clé entre deux tickets différents du même jour : l'espace n'est que de ~10 000
    valeurs par jour et par borne, à 10–30 tickets par jour la coïncidence n'est pas rare (0,5 à 4 %
    par jour, estimation) ; l'empreinte de contenu de l'ADR 0052 les départage.

## Conséquences

- Les tickets à clé courte (environ 4 % des tickets distincts à Kraainem) sont acceptés.
- Un ticket d'un autre restaurant ne crédite plus de points.
- Un nouveau restaurateur : `store_code` s'ajoute avec son premier ticket lu et confirmé (à faire à la main ;
  l'onboarding ne le déduit pas encore).
- Avant la migration, le code déployé se comporte comme avant (motif à 5 chiffres, pas de contrôle de code).

## Alternatives rejetées

**Garder les cinq chiffres.** Refuse des tickets réels.

**Accepter n'importe quel nombre de chiffres.** Ouvre les lectures partielles (un chiffre perdu donne une
autre clé valide : « 0242 » lu pour « 02420 ») et les zéros ajoutés à tort.

**Mettre le code dans le motif.** Impossible de distinguer « d'un autre établissement » de « mal lu » :
le membre recevrait « reprends la photo » indéfiniment pour un ticket de Houba.

**Accepter un ticket d'ailleurs en le mettant en revue.** Des points partiraient sur un ticket d'ailleurs.
Écarté par le porteur.

**Corriger les clés existantes automatiquement.** Modifie des données validées et des points déjà crédités.

**Un exemple avec le bon code dans la consigne.** Aide la lecture, mais fait lire le code de l'établissement
courant sur un ticket d'un autre (§5).
