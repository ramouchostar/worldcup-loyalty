# ADR 0019 — Découverte de la clé unique de ticket à l'onboarding

**Date** : 2026-07-06
**Statut** : Accepté

## Contexte

L'anti-doublon des commandes (ADR 0008) repose sur le Bestelnummer au format `YYYY-MM-DD/NNN/NNNNN`, codé en dur dans le regex d'extraction (`lib/receipt-ocr.ts`), la validation (`lib/orders.ts`) et la construction du `duplicate_key`. C'est le format d'une seule caisse — celle de Belchicken. Depuis le pivot plateforme (ADR 0015), n'importe quel restaurateur peut s'inscrire : ses tickets ont un autre format, et le pipeline actuel ne détecterait jamais leur numéro de commande — toutes leurs commandes partiraient en file admin avec une clé synthétique, sans protection anti-doublon réelle.

De plus, `orders.duplicate_key` est UNIQUE **globalement** : deux établissements dont les caisses impriment des numéros séquentiels simples (ex. `258`) se bloqueraient mutuellement.

## Décision

### 1. Une config de clé de commande par établissement

Table `restaurant_receipt_config` (m32, 1 ligne par resto) : `has_reliable_key`, `key_label` (nom du champ tel qu'imprimé), `key_description` (phrase injectée dans le prompt OCR), `key_pattern` (regex ancrée), `key_examples`, `position_hint`, `date_group` (groupe de capture contenant une date `YYYY-MM-DD`, sinon NULL), `confirmed_at/by`. RLS sans policy — service-role uniquement, le pattern sert à l'anti-fraude.

### 2. Découverte assistée à l'onboarding — l'app propose, le restaurateur décide

Étape 3/3 de `become-a-partner` : le restaurateur envoie 2-3 photos de tickets. Un **seul appel vision** sur un modèle fort (`claude-sonnet-5` — coût unique par établissement, ~quelques centimes) identifie le champ unique présent sur tous les tickets et propose label, description, regex, valeurs extraites par photo, position et date encapsulée. Garde serveur avant toute sauvegarde : la regex doit compiler, être ancrée (`^...$`), rester ≤ 200 caractères (anti-ReDoS) et matcher tous les exemples — sinon la proposition est rétrogradée en « pas de clé fiable ». Le restaurateur confirme, corrige (champs éditables, détails techniques repliés) ou déclare ne pas avoir de numéro fiable (même principe que l'ADR 0013 : jamais appliqué sans décision humaine).

### 3. Le pipeline OCR client devient piloté par la config

`analyzeReceipt(file, restaurantName, config?)` : la section « Bestelnummer » du prompt est générée depuis la config ; la clé extraite est validée contre `key_pattern`. `validateOrderKey` et `extractDateFromKey` (`lib/receipt-config.ts`) remplacent `validateOrderNumber` et le `split("/")[0]` en dur. Les restos **sans ligne de config** retombent sur `LEGACY_BESTELNUMMER_CONFIG` — comportement historique à l'identique, zéro régression même sans seed.

### 4. `duplicate_key` scopé par établissement

Format `"<restaurant_id>:<clé>"` (clé synthétique incluse : `"<restaurant_id>:NOBN_..."`), backfill idempotent des lignes existantes dans m32. Le flag `no_bestelnummer` devient `no_order_key` (les deux restent mappés dans la file admin pour l'historique).

### 5. Fallback sans clé fiable

`has_reliable_key = false` (déclaré par le resto ou constaté par l'analyse) : le prompt OCR ne demande pas de clé, chaque commande reçoit une clé synthétique et le flag `no_order_key` → file admin, comme le cas « pas de Bestelnummer » actuel.

## Alternatives rejetées

- **Un format universel imposé (Bestelnummer)** : irréaliste, les caisses des restaurateurs ne sont pas configurables par nous.
- **Choix manuel du format par le restaurateur (formulaire regex)** : personne ne sait écrire un regex ; la découverte assistée avec confirmation donne le même contrôle sans la friction.
- **Découverte à la volée sur chaque ticket client** (demander au modèle de trouver « un numéro unique » sans config) : non déterministe — deux scans du même ticket pourraient extraire des champs différents et casser l'anti-doublon.
- **Analyse des exemples sur haiku** : la robustesse de la regex proposée conditionne tout l'anti-fraude de l'établissement ; one-shot → le modèle fort se justifie.

## Conséquences

### Schéma (m32)
- Table `restaurant_receipt_config` + seed Bestelnummer confirmé pour `kraainem`.
- Backfill `duplicate_key` préfixé par `restaurant_id` (idempotent).

### Code
- `lib/receipt-config.ts` (nouveau) : `getReceiptConfig` (fallback legacy), `validateOrderKey`, `extractDateFromKey`, `compileKeyPattern`.
- `lib/receipt-key-discovery.ts` (nouveau) : `discoverReceiptKey` (sonnet-5), `validateProposedPattern`.
- `lib/receipt-ocr.ts` : prompt à section clé dynamique, validation par pattern config.
- `app/api/orders/route.ts` : validation/date/duplicate_key pilotés par la config, flag `no_order_key`.
- `app/api/orders/parse-receipt/route.ts` : renvoie aussi `key_label` (métadonnée non sensible pour libeller le champ côté membre).
- `app/become-a-partner/[restaurantId]/receipt/` (nouveau) + actions `analyzeReceiptSamples` / `confirmReceiptConfig` ; le flux menu redirige vers cette étape.
- `app/r/[restaurantId]/submit-order/page.tsx` : libellés génériques (`key_label` de l'établissement).

### Opérationnel
- m32 à exécuter au moment du déploiement du code qui préfixe `duplicate_key` (fenêtre courte acceptable, UPDATE idempotent).
- Un resto peut refaire l'étape en revisitant `/become-a-partner/<id>/receipt` (changement de caisse).
