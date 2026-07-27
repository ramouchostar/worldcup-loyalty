# ADR 0029 — Modèle de monétisation (freemium piloté par la donnée)

**Statut** : Accepté (2026-07-27) — **modèle décidé, PAS encore implémenté**. Le client payant est le **restaurateur** ; le **membre ne paie jamais** et son expérience est identique quel que soit le plan du resto (ADR 0007 / 0028 intacts). Montants € : à caler.

## Contexte

L'app doit générer du revenu sans casser ce qui fait sa valeur. Deux observations terrain du porteur cadrent tout :

1. **Les payeurs sont les restos « croissance »** — ceux qui veulent *comprendre et développer* leur activité. La majorité des restos ne paieront pas… mais **ils fournissent la donnée** dont les payeurs ont besoin. Le gratuit n'est donc **pas un centre de coût à rogner** : c'est le moteur qui rend le payant possible.
2. **Deux verrous** rendent l'app inarrachable, façon Odoo (dont le génie n'est pas l'app gratuite mais l'**intégration des données** qui rend le départ coûteux) :
   - **Verrou membres** — dès que les clients du resto sont inscrits, ont des points et une équipe, le resto ne peut plus partir sans perdre sa base de fidélité. Installé **gratuitement**.
   - **Verrou données** — le forecast, les opportunités, les ventes par plat n'existent **que** grâce à l'historique accumulé en gratuit. La fonction est impossible sans la donnée du resto → il l'a nourrie → il la veut → il paie.

Le gratuit fabrique le verrou #1 et la donnée ; le payant monétise le verrou #2. C'est le flywheel.

## Décision

### 1. Le revenu vient des CAPACITÉS, pas du VOLUME
On ne facture pas l'usage (scans, membres) comme levier de revenu. On facture l'accès aux **fonctions avancées**. Le volume n'intervient que pour **couvrir le coût OCR réel** (§6).

### 2. Trois plans (jamais l'à la carte)
| Plan | Contenu | Cible |
|---|---|---|
| **Gratuit** | Programme membre complet (scan, parrainage, équipes, récompenses solo + communautaires, réserve, micro-récompenses, QR) + **broadcast manuel** + **baromètre de base** | Tous — la donnée + le verrou membres |
| **Croissance** | Tout **A — analytique établissement** : Forecast (ADR 0027), Ventes par plat (0020), Opportunités/insights, **broadcasts programmés/stratégiques** (0023), **baromètre avancé** (tendance/décomposition, 0026) | « comprendre et développer SA maison » |
| **Pro** | Croissance **+ B — Repères secteur** (agrégats anonymisés inter-restos) | « les plus ambitieux » — se situer dans SON secteur |

Les deux **segments de payeurs** deviennent littéralement les deux paliers : Croissance = ta maison, Pro = ton secteur. Simple à comprendre, à vendre, montée en gamme naturelle. Pas de nickel-and-diming fonction par fonction (leçon Odoo).

### 3. Le cœur gratuit est le moteur — on ne le rogne pas
Tout le programme membre reste gratuit **à vie**. Sa mission : générer la donnée et verrouiller les membres. On ne le plafonne **que** pour le coût OCR (§6), jamais comme levier de prix.

### 4. Deux produits de données payants
- **A — Analytique établissement** : sur les données **propres** du resto (→ Croissance).
- **B — Repères secteur** : agrégats **anonymisés** de tous les restos (→ Pro, §7).

### 5. Mécanisme « hook puis paywall »
- **Déclenchement** : une fonction payante devient dispo **quand elle peut impressionner** — *data-ready* pour les fonctions data (le forecast a son plancher « 4 semaines », 0027), ou à la *1ʳᵉ utilisation* pour les fonctions opérationnelles (broadcasts programmés, baromètre avancé). Jamais un écran vide au jour 1.
- **Essai** : **30 jours gratuits** au déblocage (tunable par fonction). Assez pour créer l'habitude (~4 cycles hebdo de forecast), assez court pour ne pas laisser filer le revenu.
- **Fin d'essai** : **paywall DOUX**, jamais un hard-lock. La fonction **reste visible mais verrouillée** (le forecast de la semaine existe, chiffres floutés + « Débloque tes prévisions »). Montrer ce qui est perdu convertit mieux que cacher — c'est le « ne plus pouvoir s'en passer ».

### 6. Plafond de scans = couverture coût OCR, jamais une punition
Chaque scan = un appel OCR Claude Vision (`lib/receipt-ocr.ts`) → coût réel (déjà rate-limité, F8). Donc :
- **Plafond généreux** au Gratuit, calibré sur le coût OCR réel (⚠️ **à caler** — pas 200, un resto actif l'atteindrait en jours).
- **Le membre n'est JAMAIS bloqué en plein scan** — la limite agit sur le RESTO, pas sur le membre (protéger le verrou membres + la donnée). Grâce/continuité assurée.
- **Dépassement → nudge de croissance POSITIF** vers Croissance (scans larges/illimités inclus), ancré sur l'élan du resto : « X clients scannent déjà chez toi — touche-les avec des promos et fais grimper ton CA ». Pas de « quota dépassé, paie ».
- Pas de « tier volume » séparé : un resto qui scanne beaucoup est de toute façon la cible Croissance.

### 7. Repères secteur (B) — contribution universelle, consommation Pro, anonymat garanti
- **Tous les restos contribuent** (Gratuit inclus) — c'est la réalisation de l'insight fondateur : le resto qui ne paiera jamais nourrit l'intelligence collective que les Pro consomment. Plus de restos → repères plus précis → plus de Pro.
- **Seul Pro consulte** les repères.
- **Uniquement des agrégats anonymisés** franchissent la frontière inter-restos (« la médiane de ton secteur fait +18 % le jeudi »), **jamais** de chiffres bruts identifiables — cohérent ADR 0007 / 0016.
- **Seuil plancher** : un agrégat ne s'affiche que si ≥ N restos dans le secteur/zone (anti-ré-identification), même logique que « pas assez de données » ailleurs.
- **Clause CGU** : le resto accepte que ses données **anonymisées** alimentent les repères — contrepartie du gratuit (à valider juridiquement).

### 8. Prix — philosophie
Abonnement **mensuel plat par établissement**, ancré sur la **valeur** (le CA que l'app aide à générer), pas sur le coût. Montants exacts **à caler** (coûts réels + marché). Le membre ne paie jamais.

## Conséquences sur le code (chantier futur — RIEN n'est codé)

- **Entitlements par établissement** : plan courant (gratuit/croissance/pro) + état d'essai par fonction (débloqué le / essai jusqu'au / payé). Table `restaurant_subscriptions` + `feature_trials`.
- **Gardes de fonction** : chaque surface avancée (forecast, ventes, opportunités, broadcasts programmés, baromètre avancé, repères secteur) vérifie l'entitlement côté serveur → paywall doux côté client.
- **Métering des scans** : étendre l'infra de rate-limit/budget existante (m44) pour compter les scans/mois par resto et déclencher le nudge.
- **Agrégation secteur (B)** : job d'agrégation anonymisée avec seuil plancher N.
- **Facturation** : Stripe (abonnements + changements de plan + fin d'essai).
- **CGU** : clause de contribution anonymisée.
- **Aucun impact membre** : les surfaces membres (ADR 0007/0028) ne changent pas ; seule diffère la richesse des promos qu'un resto payant peut envoyer.

## Alternatives rejetées

- **Pay-per-scan comme levier de revenu** : punit le resto qui a des membres engagés (il ne contrôle pas le volume de scans) et sabote la génération de donnée + le verrou membres. Le scan ne sert qu'à couvrir le coût OCR.
- **À la carte (une fonction = un abonnement)** : fatigue de décision, ARPU faible, illisible. Les 3 plans priment (leçon Odoo).
- **Seuls les payants alimentent les repères secteur** : affaiblit l'effet de réseau — on perd la donnée des non-payeurs, qui est justement l'actif.
- **Paywall dur (fonction cachée en fin d'essai)** : convertit moins bien que le paywall doux qui montre la valeur verrouillée.
- **Cœur gratuit plafonné tôt (200 scans)** : throttle la donnée + les membres = les deux actifs stratégiques. Plafond généreux, orienté couverture de coût.

## Périmètre / suite

- **Cet ADR = le modèle.** L'implémentation est un chantier phasé à cadrer (entitlements → paywall doux → métering → Stripe → agrégation secteur), à faire quand on décide de monétiser.
- **À caler avant lancement** : plafond de scans (coût OCR réel), montants des plans, durée d'essai par fonction, seuil plancher N des repères.
