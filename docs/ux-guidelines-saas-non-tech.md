# Guidelines UX/UI pour SaaS grand public à faible littératie numérique

**Synthèse de recherche — 11 août 2026.** Recherche menée en français, anglais, néerlandais, allemand, espagnol et japonais sur les guidelines 2023–2026 (priorité aux sources les plus récentes) en UX/UI design et UX research pour les applications SaaS/web utilisées par des personnes peu à l'aise avec l'informatique. Chaque pratique est classée **[QUICK WIN]** (applicable immédiatement, faible coût) ou **[PROGRESSIF]** (structurel, à déployer petit à petit), avec les statistiques vérifiables et leurs sources.

> Contexte projet : ce document sert de référentiel pour WorldCup Loyalty (PWA de fidélité restaurant, mobile-first, clientèle grand public belge). Les renvois aux ADRs indiquent où le produit applique déjà — ou devrait appliquer — chaque pratique.

---

## 1. Pourquoi c'est critique : le public cible en chiffres

Ces chiffres institutionnels (vérifiables aux URLs en fin de document) établissent que « concevoir simple » n'est pas un raffinement mais une condition d'usage :

| Statistique | Chiffre | Source (année) |
|---|---|---|
| Belges (16–74 ans) en vulnérabilité numérique | **40 %** | Baromètre de l'Inclusion Numérique, Fondation Roi Baudouin / UCLouvain / Statbel (2024) |
| Belges sans compétences numériques de base | 41 % (59 % en ont) ; 55–64 ans : 48,9 % en ont ; 65–74 ans : 39,1 % | Statbel (2023) |
| Belges peu diplômés (≤ secondaire inférieur) en vulnérabilité numérique | **68 %** | Statbel via Baromètre FRB (2024) |
| Français (15+) en situation d'illectronisme | 15,7 % ; 34 % des 16–74 ans manquent de compétences numériques | INSEE Focus n°376 (2026) |
| Français ayant renoncé à une démarche en ligne faute d'y arriver | **1 sur 3** | INSEE (2021, publié 2026) |
| Français éprouvant au moins une difficulté bloquante en ligne | 54 % | Baromètre du numérique CREDOC/ARCEP (2024) |
| Européens (16–74) avec compétences numériques de base | 60 % (2025) ; seulement **33 % des 65–74 ans** | Eurostat (2025) |
| Adultes OCDE au niveau 1 ou moins en littératie/numératie | **~1 sur 3** | OCDE PIAAC Cycle 2, 160 000 adultes, 31 pays (2023, publié 2024) |

**Implication pour une app de fidélité restaurant en Belgique : environ 4 clients sur 10 auront statistiquement du mal avec une interface « standard ». L'hypothèse par défaut doit être l'utilisateur incertain qui découvre l'app pour la première fois.** Et la règle espagnole (Aguayo) résume le bénéfice : « si ça marche bien pour la personne âgée, ça marchera bien pour presque tout le monde ».

---

## 2. Les principes fondamentaux, avec preuves chiffrées

### 2.1 Langage clair — le levier le plus rentable de tous **[QUICK WIN]**

- **La réécriture en langage simple double quasiment le taux de réussite** : dans l'étude de référence NN/g (site santé réel), le taux de réussite des tâches pour les utilisateurs à faible littératie est passé de **46 % à 82 %** après simplification des textes, avec des tâches accomplies **2× plus vite** — et la satisfaction a augmenté pour *tous* les profils, y compris les diplômés du supérieur. Personne n'a jamais reproché à une interface d'être trop claire.
- **80 % des lecteurs préfèrent le langage simple, experts compris** — et plus le sujet est complexe, plus la préférence est forte (Center for Plain Language).
- Le GOV.UK vise un **âge de lecture de 9 ans** ; le standard néerlandais (Rijksoverheid) vise le **niveau CECR B1** ; la méthode FALC (Unapei/UE) prescrit : **une phrase = une idée, ≤ 12 mots par phrase, mots courants, un mot = un seul sens**, pas de jargon, pas d'anglicismes, jamais de texte tout en majuscules.
- Règle allemande convergente (DIN SPEC 33429 « Leichte Sprache », 2025 ; guidance senior) : bannir les mots étrangers et anglicismes des libellés.

Règles concrètes de copy : libeller les boutons par le **résultat** (« Voir mes cadeaux », pas « Continuer » ni « Soumettre ») — les études de cas microcopy mesurent **+11 à +20 % de conversion** sur ce seul point ; front-loader l'information clé ; texte en une seule colonne ; pas de blocs longs (les lecteurs faibles ne scannent pas, ils lisent mot à mot ou sautent le bloc entier).

*Application projet : le glossaire CONTEXT.md (terminologie unique et constante) est déjà un atout. Auditer chaque libellé client au niveau B1 : phrases ≤ 12 mots, zéro anglicisme, zéro terme technique (« OCR », « validation » sont déjà bannis par ADR 0008).*

### 2.2 Formulaires : moins de champs, validation immédiate, erreurs humaines **[QUICK WIN]**

- **Chaque champ supplémentaire coûte ~5–10 % de conversion** ; les flux transactionnels typiques portent **~2× plus de champs que nécessaire** (Baymard : 11,3–14,9 champs en moyenne, ~7–8 suffisent) ; 17–18 % des abandons sont dus à la seule complexité du parcours ; corriger l'UX d'un checkout peut rapporter jusqu'à **+35 % de conversion** (Baymard 2024).
- **Validation inline (à la sortie du champ, pas à la frappe)** : le résultat le plus répliqué du domaine — **+22 % de réussite, −42 % de temps de complétion, +31 % de satisfaction** (Wroblewski/Etre, confirmé par Baymard). Attention : la validation *à la frappe* augmente les erreurs (valider au blur).
- **Messages d'erreur** (canon NN/g + DSFR) : nommer le problème + expliquer comment corriger, à côté du champ, en langage humain, sans code d'erreur, sans culpabiliser, en conservant la saisie de l'utilisateur. Contraste fort + icône (jamais la couleur seule).
- Labels **visibles au-dessus des champs** — jamais de placeholder-comme-label (baisse la complétion et échoue au WCAG).
- Préférer les **réponses fermées** (boutons, choix) aux champs libres (guideline néerlandaise Gebruiker Centraal, testée avec de vrais publics peu lettrés).
- DSFR : une seule colonne, champs groupés, marquer « (optionnel) » plutôt qu'étoiler l'obligatoire.
- Détail à fort impact : `inputmode="decimal"` sur le champ montant du ticket — le clavier numérique s'ouvre directement (Baymard touch-keyboard labs).

### 2.3 « Une chose par écran » — mais tester les steppers **[PROGRESSIF]**

- Le pattern **« one thing per page »** du GOV.UK (8 séries de tests incluant des publics à faible confiance numérique) est le plus efficace pour les utilisateurs hésitants, le mobile, la gestion d'erreurs et la reprise de parcours.
- **Découverte contre-intuitive, répliquée deux fois** : les indicateurs d'étapes (steppers/progress bars de formulaire) ne sont pas automatiquement utiles. Le GDS a retiré un indicateur de 12 étapes (Carer's Allowance) **sans aucun effet** sur la complétion ; la recherche néerlandaise (Toolkit Inclusie) a montré qu'ils peuvent être **contre-productifs pour les publics peu lettrés** (distraction + pression). À tester avant d'ajouter. (À ne pas confondre avec les barres de progression de *gamification*, qui elles fonctionnent — voir 2.6.)
- Corollaire « Dites-le-nous une fois » (DesignGouv + WCAG 2.2 critère 3.3.7) : **ne jamais redemander une information que l'app connaît déjà**.

### 2.4 Tactile, typographie, contraste **[QUICK WIN]**

- **Cibles tactiles : ≥ 48×48 dp (~1 cm), espacées de ≥ 8 dp.** L'étude MDPI 2024/25 sur seniors mesure ~**80 % de précision à 6 mm contre ~100 % à 11 mm** ; sous 44 px, les erreurs de tap **triplent**. Les guidelines japonaises seniors (contexte : >90 % des sexagénaires japonais ont un smartphone), Apple HIG (44 pt) et Material (48 dp) convergent. WCAG 2.2 fixe un plancher légal à 24×24 px — c'est un minimum, pas un objectif.
- **Texte de base ≥ 16 px, jamais moins** ; chiffres clés et CTA plus grands ; pour les seniors la revue systématique Frontiers in Psychology (2022) confirme : plus grand = plus précis, plus rapide, moins fatigant (avec un plafond au-delà duquel ça se dégrade). Police sans empattement (FALC).
- **Contraste ≥ 4,5:1 partout** (RGAA/WCAG AA) ; supprimer les gris clairs sur blanc — illisibles pour beaucoup de seniors.
- **Ne jamais bloquer le zoom** (pas de `user-scalable=no`).
- Boutons qui *ressemblent* à des boutons (fond plein, bordure visible) — pas de ghost buttons (revue systématique JMIR 2023).
- **Aucune interaction par geste seul** (swipe, appui long, pincement, drag) : les guidelines seniors japonaises posent que ces gestes ne sont pas compris — toujours offrir un bouton visible équivalent (aussi exigé par WCAG 2.2 « Dragging Movements »).
- Zone du pouce : **75 % des utilisateurs naviguent au pouce, 49 % à une main** (Hoober, 1 300+ observations) → actions principales dans le tiers bas de l'écran, CTA épinglé en bas du viewport (+5–12 % de complétion dans les tests A/B checkout).
- Matériel réel : **46–53 % des seniors utilisent un smartphone de plus de 2 ans** → budget performance, tester sur appareils lents.

### 2.5 Navigation : visible, étiquetée, limitée **[QUICK WIN si partiel / PROGRESSIF si refonte]**

- **Barre d'onglets en bas > menu hamburger** : les fonctionnalités cachées dans un hamburger sont **2–3× moins découvertes**, effet *plus fort encore* chez les utilisateurs âgés/occasionnels. Cas mesurés : Spotify **+9 % de clics globaux, +30 % sur les items de menu** en passant aux onglets ; A/B Booking.com dans le même sens ; les utilisateurs accomplissent leurs tâches ~40 % plus vite avec une bottom nav.
- **3 à 5 entrées maximum** (loi de Hick : le temps de décision croît avec le nombre d'options), **toujours icône + libellé texte** : les études d'iconographie montrent que **30 % des icônes standard ne sont pas reconnues** ; seules ~15/80 icônes courantes sont « hautement reconnaissables ». Jamais d'icône seule pour une action primaire.
- Loi de Jakob : suivre les conventions que les utilisateurs connaissent déjà (WhatsApp, Google) — les publics peu à l'aise ne se remettent pas d'un pattern inédit.
- Navigation linéaire, « prochaine étape évidente » ; regrouper l'information en 3–4 blocs (loi de Miller).

### 2.6 Progression dotée et goal gradient — le cœur psychologique d'une app de fidélité **[QUICK WIN]**

- **Effet de progression dotée (Nunes & Drèze, étude terrain)** : une carte 10 cases avec 2 cases pré-tamponnées atteint **34 % de complétion contre 19 %** pour une carte 8 cases vierge — même effort réel, complétion presque doublée par le simple sentiment d'avoir déjà commencé.
- **Goal gradient (Kivetz et al., 948 vrais membres d'un café)** : l'intervalle entre achats se réduit d'environ **20 %** à mesure qu'on approche de l'objectif — les clients accélèrent près du but.
- Règles pratiques : **ne jamais afficher une barre de progression vide** (créditer une avance visible dès l'inscription — jeton de bienvenue, « votre premier ticket = progression immédiate ») ; messages « plus que X points avant [conséquence concrète] » près de l'objectif ; récompense intermédiaire à mi-parcours ; première récompense atteignable en ~5 visites (benchmark restauration française : « assez pour installer l'habitude, assez court pour rester motivant »).
- Contexte marché : les membres fidélité restaurant viennent **+22 % plus souvent et dépensent +38 % de plus par visite** (études FR 2025–2026) ; **72 % des clients choisissent un restaurant pour ses offres de fidélité**.

*Application projet : ADR 0010 (conséquences, pas chiffres) est déjà aligné. Vérifier qu'aucune surface n'affiche de barre à 0 %.*

### 2.7 Concevoir pour la récupération, pas seulement l'accumulation **[QUICK WIN]**

- Le plus grand écart mesuré des programmes de fidélité : 53 % de membres actifs en transactions mais seulement ~35 % actifs en **récupération** de récompenses ; or les membres qui récupèrent dépensent **+25 %** (McKinsey) à 3,1× plus. **41 % des points expirent sans être utilisés** (~100 Md$/an) — l'expiration silencieuse détruit la confiance.
- **Les rappels d'expiration fonctionnent** : un guidage proactif (« expire dans 7 jours » + chemin direct vers la récupération) fait passer les taux de première récupération de ~35–45 % à **62–74 %**.
- Canal : WhatsApp affiche **~98 % d'ouverture, 80 % dans les 5 minutes**, contre ~21 % pour l'email et 3–10 % de lecture pour le push — mais l'opt-out est à un tap : plafonner la fréquence, chaque message doit être actionnable.

*Application projet : nudge WhatsApp à ~24 h et ~6 h avant l'expiration 48 h du cadeau (ADR 0011), avec lien direct vers le coupon.*

### 2.8 Authentification sans mémoire **[QUICK WIN]**

- **WCAG 2.2 (oct. 2023), critère 3.3.8 « Accessible Authentication »** : aucun test cognitif (mémoriser, transcrire) pour se connecter — magic links, OTP, passkeys, OAuth conformes ; les mots de passe pénalisent précisément le public visé.
- Chiffres : **Calendly est passé de 43 % à 71 % de complétion d'inscription** en adoptant les magic links (mobile ~3× mieux) ; Substack +28 % de conversions ; les parcours à mot de passe montrent 2,8× plus d'abandon sur mobile ; −42,8 % de tickets support (plus de « mot de passe oublié »).
- Modes de défaillance connus des magic links à prévoir : scanners d'emails d'entreprise qui consomment le jeton, lien ouvert dans un autre navigateur. Mitigations : re-demande sans pénalité, consigne « Ouvrez l'email sur CE téléphone », repli code OTP à 6 chiffres (charge cognitive minimale, reste sur le même appareil).
- Ordre optimal pour ce public : **Google en un tap d'abord** (la plupart des clients Android belges ont déjà un compte Google sur le téléphone), champ email unique + magic link ensuite.

### 2.9 Onboarding : le chemin le plus court vers la valeur **[QUICK WIN pour l'ordre du flux / PROGRESSIF pour la mesure]**

- **~77 % des utilisateurs abandonnent une app dans les 3 jours** ; rétention J7 ≈ 5–7 % ; **8 abandons sur 10 viennent de « je ne sais pas m'en servir »** ; un bon onboarding peut améliorer la rétention jusqu'à +50 %.
- **Chaque écran avant la valeur coûte ~10–15 % de complétion** ; >98 % des utilisateurs qui n'atteignent jamais un « moment de valeur » churnent sous 2 semaines (Amplitude, 2 600+ entreprises). Cible : **premier moment de valeur (premier ticket scanné / premier aperçu de cadeau) en ≤ 2 écrans après l'authentification**, temps-vers-valeur < 5 minutes.
- NN/g : les tutoriels forcés en amont « interrompent, ne sont pas mémorisés et n'améliorent pas la performance » → préférer l'**aide contextuelle au moment du besoin** + un bouton Passer systématique.
- **Empty states instructifs partout** : l'écran vide est « le point de décrochage silencieux le plus courant » — chaque état vide doit dire quoi faire (« Soumettez votre premier ticket ») et montrer à quoi ressemblera le résultat (le fallback « prévisualiser pour €25 » d'ADR 0010 est exactement ce pattern — l'étendre aux onglets récompenses, réserve, parrainage).
- **Demander les permissions en contexte, jamais en amont** : expliquer la valeur *avant* de déclencher le prompt OS (caméra au moment du premier scan, notifications après la première récompense) — les utilisateurs « primés » dans les 48 premières heures sont 3× plus susceptibles de rester actifs.
- **Prompt d'installation PWA différé jusqu'à un moment de valeur** (après le premier ticket validé) : les prompts personnalisés obtiennent jusqu'à **6× plus d'ajouts à l'écran d'accueil** que le prompt navigateur (Lancôme : +17 % d'ajouts, +53 % de conversions). Sur iOS (pas de `beforeinstallprompt`) : fiche illustrée « Partager → Sur l'écran d'accueil ».

### 2.10 Confiance et filet humain **[PROGRESSIF]**

- Les études 2024–2026 (Nature, JMIR) montrent que chez les publics âgés/fragiles, **la méfiance, l'anxiété technologique et le faible sentiment de compétence prédisent l'abandon indépendamment de l'utilisabilité** : il faut des signaux de légitimité visibles, un comportement prévisible, une transparence sur les données, et **toujours un canal humain de secours** (ici : le cashier peut agir pour le client, WhatsApp comme canal de contact).
- Les publics peu lettrés « craignent souvent l'ordinateur, perçu comme complexe et impersonnel » (recherche néerlandaise) → le ton rassurant compte (le message « Vérification en cours… » d'ADR 0008 est ce type de réassurance).
- WCAG 2.2 critère 3.2.6 : **l'aide au même endroit sur chaque écran**.
- Feedback système permanent (heuristique NN/g n°1) : après chaque action, dire ce qui s'est passé et ce qui va suivre — écran de succès explicite après soumission du ticket, récapitulant ce qui a été gagné.

---

## 3. Plan d'action : les quick wins (applicables tout de suite)

Par ordre de rapport impact/effort décroissant :

| # | Action | Effet attendu (sourcé) |
|---|---|---|
| 1 | Réécrire tous les libellés client en langage B1 : ≤ 12 mots/phrase, mots courants, zéro jargon/anglicisme | Réussite des tâches jusqu'à ×2 (46 %→82 %) |
| 2 | Boutons libellés par le résultat (« Voir mes cadeaux »), jamais « Continuer »/« Soumettre » | +11–20 % de conversion (études microcopy) |
| 3 | Ne jamais afficher une barre de progression vide ; créditer une avance visible à l'inscription | Complétion 34 % vs 19 % (progression dotée) |
| 4 | Cibles tactiles ≥ 48 dp espacées ; CTA principal épinglé en bas (zone du pouce) | ~100 % vs 80 % de précision ; 3× moins d'erreurs de tap |
| 5 | Texte ≥ 16 px, contraste ≥ 4,5:1, zoom jamais bloqué, boutons pleins (pas de ghost) | Convergence revues systématiques seniors |
| 6 | Icône + libellé texte partout ; jamais d'icône seule sur une action primaire | 30 % des icônes standard non reconnues |
| 7 | Validation de formulaire au blur, erreur = problème + solution à côté du champ, saisie conservée | +22 % réussite, −42 % temps |
| 8 | Supprimer chaque champ non indispensable ; `inputmode="decimal"` sur le montant du ticket | ~5–10 % de conversion par champ retiré |
| 9 | Bottom nav 4–5 onglets étiquetés, action la plus fréquente (Scanner) au centre | +30 % de découverte vs hamburger |
| 10 | Rappels d'expiration des cadeaux (WhatsApp à J-1 et H-6) avec lien direct de récupération | Récupération ~35–45 % → 62–74 % |
| 11 | WhatsApp = premier bouton de partage du parrainage, message pré-rempli court, statut par ami (« en attente / crédité ») | Meilleur canal : ~12–15 % de conversion |
| 12 | Empty states instructifs sur chaque onglet (étendre le pattern « prévisualiser pour €25 ») | Écran vide = 1er point de décrochage silencieux |
| 13 | Google OAuth en premier, magic link ensuite + consigne « ouvrez l'email sur ce téléphone » + re-demande libre | Inscription 43 %→71 % (Calendly) |
| 14 | Permissions (caméra, notifications) demandées en contexte avec explication de valeur préalable | Opt-in supérieur ; 3× plus de rétention si primé sous 48 h |
| 15 | Écran de succès explicite après chaque soumission, récapitulant les 3 lignes gagnées (ADR 0010) | Feedback système = heuristique n°1 NN/g ; oriente vers la récupération |
| 16 | Aide/contact au même endroit sur chaque écran (WCAG 2.2 · 3.2.6) | Conformité + réassurance des publics anxieux |

## 4. Améliorations progressives (à étaler)

1. **Tests utilisateurs avec le vrai public** — la pratique la plus solidement étayée de toute la littérature (revue systématique 2025, 132 études ; principe fondateur du FALC ; code néerlandais CIDO 2025 « concevoir AVEC, pas pour »). Concrètement : sessions de 5 utilisateurs en restaurant avec de vrais clients seniors/occasionnels, à chaque itération majeure.
2. **Restructuration « une chose par écran »** des parcours longs (soumission de ticket : photo → montant → confirmation), en testant l'effet des steppers avant de les ajouter (résultats contradictoires selon le public).
3. **Capture de ticket guidée** : cadre de visée en direct → contrôle qualité client (flou/reflet) → auto-capture quand l'image est stable. Réduit matériellement les échecs OCR et les re-soumissions (bénéficie directement à ADR 0008/0019).
4. **Repli OTP 6 chiffres** pour les magic links (règle les cas scanner d'email / autre navigateur).
5. **Prompt d'installation PWA custom** déclenché au moment de valeur + fiche iOS illustrée + mesure du taux d'installation.
6. **Conformité RGAA / WCAG 2.2 AA complète** (clavier, lecteurs d'écran, focus, ARIA) — rappel : l'**European Accessibility Act rend l'accessibilité obligatoire pour les services numériques privés en UE depuis le 28 juin 2025** ; ce n'est plus optionnel pour une app commerciale belge.
7. **Instrumentation du funnel d'activation** : définir le moment de valeur (premier ticket validé), mesurer le temps-vers-valeur (< 5 min), le taux d'activation (benchmark SaaS : 37,5 % en moyenne, top quartile > 40 %), la rétention par cohorte, et le taux de « récupération-actifs » (le métrique le plus corrélé au surcroît de dépense).
8. **Cycle de vie de notifications gradué** (récompense gagnée → J-1 → H-6 → jalon communautaire), plafonné en fréquence.
9. **Audit de charge cognitive systématique** (nombre d'éléments par écran, une action principale par écran) — la simplification ergonomique mesure 20–60 % de complétion plus rapide et 30–70 % d'erreurs en moins.
10. **Filet humain formalisé** : parcours de secours où le cashier agit pour le client (enseignement central du Baromètre FRB et des études seniors : le numérique seul exclut).
11. **Audit de nouveauté à 90 jours** : pour chaque mécanique de gamification, vérifier que le gain d'engagement persiste au-delà de 90 jours (sinon c'était l'effet de nouveauté, pas le design).
12. **Support vieux appareils / connexions lentes** : budget performance, tests sur smartphones de +2 ans.

## 5. Anti-patterns à éviter absolument

- **Comptes à rebours factices ou décoratifs** : ~40 % des timers des sites marchands audités par Princeton étaient faux — c'est précisément ce que vise le **Digital Services Act (art. 25, dark patterns interdits depuis février 2024, amendes jusqu'à 6 % du CA mondial** ; première amende DSA : 120 M€ en déc. 2025). Les timers du projet (coupon 10 min, expiration 48 h — ADR 0011) sont réels et appliqués : c'est la seule urgence légitime. Ne jamais en ajouter de décorative. 72 % des utilisateurs abandonnent une marque après avoir découvert une manipulation.
- **Streaks et mécaniques de perte pour des visiteurs occasionnels** : une série brisée punit le comportement normal d'un client de restaurant ; la même mécanique qui triple la rétention d'un produit effondre celle d'un autre.
- **Trois « jeux » concurrents** : l'étude Journal of Marketing 2025 montre que des moteurs de récompense simultanés se cannibalisent — présenter les 3 couches (ADR 0006) comme *un seul* aperçu unifié de la prochaine commande (ce que fait la hero card ADR 0010), jamais comme trois compteurs rivaux.
- **Icônes sans libellé, ghost buttons, jargon technique** — triple peine pour ce public.
- **Placeholder utilisé comme label** ; validation à la frappe ; erreurs en haut de page détachées du champ.
- **Murs de permissions et prompts d'installation à la première visite.**
- **Barres de progression vides et écrans vides sans instruction.**
- **Expiration silencieuse des points/cadeaux** (41 % des points expirent sans usage — destructeur de confiance).
- **Sur-notification** : l'opt-out WhatsApp est à un tap et le retour improbable ; plafonner, rendre chaque message actionnable.
- **Confirmshaming, cases pré-cochées, options de refus asymétriques** — visés par le DSA/UCPD (Amazon : 8 M€ d'amende en Pologne, 2024).

---

## 6. Sources principales

**Statistiques institutionnelles (les plus solides)**
- Baromètre de l'Inclusion Numérique 2024, Fondation Roi Baudouin : https://kbs-frb.be/fr/barometre-inclusion-numerique-2024 · PDF : https://www.uclouvain.be/system/files/uclouvain_assetmanager/groups/cms-editors-cirtes/pochettes-de-livre-et-illustrations-web/Barom%C3%A8tre%20Inclusion%20Num%C3%A9rique%202024_FR.pdf
- Statbel, compétences numériques : https://statbel.fgov.be/en/themes/households/ict-usage-households/digital-skills
- INSEE Focus n°376 (2026) : https://www.insee.fr/fr/statistiques/8739245 · Compétences numériques éd. 2025 : https://www.insee.fr/fr/statistiques/8616801?sommaire=8616883
- Baromètre du numérique 2024 (CREDOC/ARCEP) : https://www.arcep.fr/uploads/tx_gspublication/barometre-du-numerique_2023_rapport_mai2024.pdf
- Eurostat, Skills for the digital age : https://ec.europa.eu/eurostat/statistics-explained/index.php?title=Skills_for_the_digital_age
- OCDE PIAAC 2023 : https://www.oecd.org/en/publications/navigating-life-with-low-literacy-and-numeracy_c198a20f-en.html

**Recherche primaire UX (études et revues systématiques)**
- NN/g, Writing for Lower-Literacy Users (46 %→82 %) : https://www.nngroup.com/articles/writing-for-lower-literacy-users/
- NN/g, 10 Usability Heuristics (rév. 2024) : https://www.nngroup.com/articles/ten-usability-heuristics/ · Error guidelines : https://www.nngroup.com/articles/errors-forms-design-guidelines/ · Onboarding vs aide contextuelle : https://www.nngroup.com/articles/onboarding-tutorials/ · Empty states : https://www.nngroup.com/articles/empty-state-interface-design/ · Seniors : https://www.nngroup.com/articles/usability-for-senior-citizens/ · Touch targets : https://www.nngroup.com/articles/touch-target-size/
- Baymard Institute, Checkout 2024 : https://baymard.com/blog/checkout-2024-launch · Champs de formulaire : https://baymard.com/blog/checkout-flow-average-form-fields · Validation inline : https://baymard.com/blog/inline-form-validation · Statistiques UX : https://baymard.com/learn/ux-statistics
- Kivetz et al., Goal-Gradient Hypothesis (2006) : https://www.researchgate.net/publication/239776073
- Nunes & Drèze, Endowed Progress (34 % vs 19 %) : https://www.coglode.com/nuggets/endowed-progress-effect
- Journal of Marketing 2025, gamification hybride qui se cannibalise : https://journals.sagepub.com/doi/10.1177/00222437241275927
- Princeton, Dark Patterns at Scale (11 000 sites) : https://arxiv.org/pdf/1907.07032
- Revue systématique apps seniors 2025 (132 études) : https://link.springer.com/article/10.1007/s40520-025-03157-7
- JMIR 2023, design guidelines seniors : https://mhealth.jmir.org/2023/1/e43186
- Frontiers in Psychology 2022, taille de police seniors : https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2022.931646/full
- MDPI 2024/25, cibles tactiles seniors : https://www.mdpi.com/3042-7126/1/1/6
- Nature 2024, méfiance numérique des seniors : https://www.nature.com/articles/s41599-024-03457-9
- McKinsey, Business Value of Design : https://www.mckinsey.com/capabilities/tech-and-ai/our-insights/the-business-value-of-design · Next in loyalty : https://www.mckinsey.com/capabilities/growth-marketing-and-sales/our-insights/next-in-loyalty-eight-levers-to-turn-customers-into-fans

**Référentiels et design systems**
- WCAG 2.2 (W3C, oct. 2023) : https://www.w3.org/TR/WCAG22/ · Nouveaux critères : https://www.wcag22aa.org/new-criteria/
- GOV.UK, One thing per page : https://designnotes.blog.gov.uk/2015/07/03/one-thing-per-page/ · Structure de formulaires : https://www.gov.uk/service-manual/design/form-structure
- DSFR, formulaires : https://www.systeme-de-design.gouv.fr/version-courante/fr/modeles/blocs-fonctionnels/formulaires
- Opquast (240 bonnes pratiques) : https://www.opquast.com/
- RGAA : https://www.info.gouv.fr/accessibilite/conception-et-design
- FALC (Unapei) : https://falc.unapei.org/quest-ce-que-le-falc/le-falc-cest-quoi/ · Belgique : https://www.falc.be/ · Mémo ANCT : https://lesbases.anct.gouv.fr/ressources/memo-des-regles-principales-en-falc
- Gebruiker Centraal (NL), formulaires pour publics peu lettrés : https://toolkitinclusie.gebruikercentraal.nl/toepassingen/richtlijnen-voor-het-ontwerpen-van-digitale-formulieren/ · Code CIDO 2025 : https://www.gebruikercentraal.nl/code-inclusief-digitaal-ontwerpen-ontwerpen-met-mensen-voor-mensen/
- Taalniveau B1 (Rijksoverheid) : https://www.communicatierijk.nl/vakkennis/rijkswebsites/aanbevolen-richtlijnen/taalniveau-b1
- DIN SPEC 33429, Leichte Sprache (2025) : https://www.bmas.de/DE/Service/Presse/Meldungen/2025/einheitliche-empfehlungen-leichte-sprache.html
- D21-Digital-Index 2024/25 (DE) : https://initiatived21.de/publikationen/d21-digital-index/2024-25
- ONTSI, Competencias Digitales 2024 (ES) : https://www.ontsi.es/sites/ontsi/files/2024-08/Competencias-Digitales-23.pdf
- CULUMU (JP), UI seniors : https://note.com/culumu/n/n8e1fbbec0c42
- DesignGouv / Vos démarches essentielles : https://observatoire.numerique.gouv.fr/observatoire

**Auth, PWA, notifications, fidélité (études de cas et benchmarks sectoriels — chiffres directionnels)**
- Magic links, cas Calendly/Substack : https://supertokens.com/blog/magiclinks · MojoAuth 2026 : https://mojoauth.com/data-and-research-reports/passwordless-conversion-impact-report-2026/
- PWA install prompts : https://www.gomage.com/blog/pwa-add-to-home-screen/
- WhatsApp business stats : https://www.wapikit.com/blog/global-whatsapp-business-statistics-2025 · Parrainage : https://marketingltb.com/blog/statistics/referral-marketing-statistics/
- Fidélité restauration FR : https://www.billiv.fr/fr/blog/fidelite/fidelite-restaurants-2026 · https://www.heypongo.com/blog/les-programmes-de-fidelite-pour-restaurants · IFOP×Comarch gamification : https://www.influencia.net/programmes-de-fidelite-lappetence-des-francais-pour-la-gamification/
- Benchmarks onboarding/activation SaaS : https://productgrowth.in/insights/saas/saas-onboarding-benchmarks/ · https://userguiding.com/blog/user-onboarding-statistics
- Navigation bottom tabs vs hamburger : https://moldstud.com/articles/p-tab-bars-vs-hamburger-menus-analyzing-user-preferences-in-mobile-apps
- DSA / dark patterns : https://www.goodwinlaw.com/en/insights/publications/2025/12/alerts-practices-antc-ec-issues-first-non-compliance-fine-under

**Note de fiabilité.** Les chiffres les plus défendables sont : INSEE/Statbel/FRB/Eurostat/OCDE (institutionnels), NN/g 46 %→82 %, Baymard (14 ans de recherche à grande échelle), Nunes & Drèze 34 %/19 %, Kivetz, la crawl Princeton, le Journal of Marketing 2025 et les revues systématiques JMIR/Springer/Frontiers. Les statistiques issues de vendeurs (MojoAuth, Gitnux, agences) sont directionnelles : les citer comme ordres de grandeur, pas comme valeurs exactes.
