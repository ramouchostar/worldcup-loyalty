# ADR 0046 — Rapprochement catalogue ↔ tickets & boucle de complétion du catalogue

**Statut** : Accepté (2026-08-31) — lots 1-3 implémentés (moteur) ; lots 4-6 (boucle de
complétion, verrous d'affichage, cycle de vie) en cours, même chantier backlog.

## Contexte

Mesuré sur kraainem (seul resto réel) : **38 lignes de tickets sur 46 (83 %) non
rattachées** au catalogue (`order_items.menu_item_id NULL`). La page Ventes affichait
chaque libellé inconnu comme un « plat hors catalogue » et la marge n'était calculée
que sur les 17 % reconnus → chiffres inutilisables pour le restaurateur.

Causes mesurées : la caisse **suffixe la catégorie** (« Finest (Burger) », « Fries
(Medium) ») ; **lignes techniques** (« DrinkVATAdjustment » ×10 — un ajustement TVA
affiché comme un plat) ; **libellés anglais** vs catalogue français ; **compositions**
(« Smoky Menu (Medium Fries) + Pepsi + Sweet Chilli ») ; et surtout le matching
(ADR 0020, égalité stricte) ne tournait **qu'à l'insertion** — un catalogue créé ou
corrigé après coup laissait les lignes orphelines pour toujours. Le catalogue vit
aussi : nouveaux produits (BelTacos), produits **temporaires** (Minion Burger, promo
film), articles au menu **sans coût connu** (Kebab Wrap, écarté de l'import de marges).

## Décision

**Principe produit : le ticket est la source qui maintient le catalogue à jour.** Le
restaurateur ne re-soumet jamais un fichier pour corriger — il complète en un tap.

1. **Matching déterministe à plusieurs niveaux** (`lib/menu-match.ts`) — toujours pas
   de fuzzy silencieux (règle ADR 0020 maintenue : un faux positif pollue les stats) :
   alias du resto → égalité stricte normalisée → ligne technique → libellé **canonisé**
   (troncature au premier « + », parenthèses finales **sans chiffre** retirées — les
   tailles « (16) » du catalogue sont conservées) → alias/catalogue sur cette forme.
2. **Table `menu_item_aliases`** (migration `20260831-2335`) : alias normalisés par
   resto, posés par le seed et par les rapprochements manuels ; `menu_item_id NULL`
   = « à ignorer ». Seed kraainem : Fries→Frites, DrinkVATAdjustment→ignorer.
3. **Lignes techniques** (`order_items.is_ignored`) : ajustements TVA, remises,
   livraison… — motifs conservateurs globaux + alias par resto. Une ligne ignorée
   reste en base mais sort des plats et du CA par plat.
4. **Rétro-rattachement** (`lib/menu-rematch.ts`) : à chaque modification du catalogue
   (import, formulaire, alias), les lignes jamais rattachées du resto sont re-matchées
   — batch, idempotent, best-effort, ne bloque jamais l'action d'origine.
5. **Boucle de complétion** (lot 4) : un libellé inconnu vu sur **≥ 2 tickets
   distincts** (seuil validé par le porteur) déclenche une carte « À faire » sur le
   dashboard admin → formulaire rapide multi-lignes, prix de vente pré-rempli depuis
   le ticket (`unit_price`), trois issues : ajouter au catalogue / rattacher à un
   article existant (suggestions par similarité — le fuzzy sert ici, en suggestion
   humaine) / ignorer. Jamais une notification par ticket ; e-mail de rappel unique
   après 7 jours d'inaction.
6. **Article sans coût admis au catalogue** (validé par le porteur) : il se rattache
   et son CA compte immédiatement ; sa marge s'affiche « coût manquant » — jamais
   100 % ni 0 — et la carte « À faire » réclame les coûts manquants. Produits
   temporaires : `is_active=false` / réactivation, jamais de suppression (l'historique
   et les paliers pointent dessus). **V1 : le coût courant s'applique à tout
   l'historique** ; l'historisation des coûts est explicitement hors scope.

## Conséquences

- Kraainem passe de 17 % à ~80 % de lignes reconnues avec le seul moteur (le solde
  relève de la boucle de complétion : BelTacos, Minion Burger, Kebab Wrap sans coût).
- La marge affichée est toujours qualifiée (« sur articles reconnus — NN % du volume »).
- Les alias sont des données par resto : aucune règle spécifique à une caisse n'est
  codée en dur, la table apprend des rapprochements manuels.
- Insights et repères secteur consomment les mêmes `order_items` : ils bénéficient du
  rétro-rattachement sans changement.
