# Restos de test — scénarios nommés par volume de données

Plusieurs fonctionnalités ne s'activent qu'au-delà d'un **seuil de données**. Le jeu
d'audit initial (`scripts/seed-audit.mjs`) était plat (20–50 commandes partout) : on ne
savait jamais sur quel resto regarder un résultat. `scripts/seed-scenarios.mjs` le
transforme en **restos-scénarios** dont le **nom dit ce qu'ils contiennent** — et donc
ce qu'ils permettent de tester. Script **idempotent** (top-up jusqu'aux volumes cibles,
rejouable) ; même espace de noms que l'audit (`zz-test-*`, `@seed.boosteats.test`) →
`scripts/seed-audit-clean.mjs` démonte tout.

Les comptes de test et leur mot de passe sont décrits dans `mission-audit-seed.md`
(ne pas dupliquer le mot de passe ici).

## Seuils d'activation (code)

| Fonctionnalité | S'active à partir de | Constante |
|---|---|---|
| Prévisions | 4 semaines de ventes caisse importées | `MIN_WEEKS` (lib/forecast.ts) |
| Opportunités | 30 articles scannés sur 90 j | `MIN_ITEMS_FOR_INSIGHTS` (lib/insights.ts) |
| Baromètre (état) | 5 retours | `INSUFFICIENT_MIN` (lib/barometer.ts) |
| Avis côté membre | 3 commandes validées par membre | `FEEDBACK_ELIGIBILITY_MIN` |
| Repères secteur | cohorte ≥ 5 restos ayant ≥ 10 commandes | `SECTOR_MIN_RESTAURANTS`, `MIN_ORDERS_PER_RESTO` |
| Nudge scans (Gratuit) | > 400 scans dans le mois | `SCAN_CAP_GRATUIT` |
| Segments broadcast / insights audience | ≥ 20 membres consentants | `INSIGHTS_MIN_SEGMENT` |
| Paliers de score d'équipe (seed) | 200 / 500 / 1000 pts | `reward_tiers` layer community |
| Paliers d'équipe couche 3 (scénario Équipes) | 500 / 1500 / 3000 € de dépense cumulée | `team_tiers` |

## Les restos-scénarios

| Resto (`id`) | Nom | Plan · compte | Volumes | Sert à tester |
|---|---|---|---|---|
| `zz-test-focus-a` | **Pizza · 1000 tickets · 300 clients · tout activé** | Pro · `owner-a` | 300 membres, 1 000 commandes, ~2 350 articles, 201 membres éligibles avis, 40 retours, 13 sem. de ventes, 450 scans | **Les résultats** de toutes les fonctions : Prévisions, Opportunités, Ventes par plat, Baromètre avancé, Repères secteur, Mes clients, Broadcasts/segments |
| `zz-test-focus-b` | **Burger · 300 tickets · 300 clients · paywalls** | Gratuit, 6 essais expirés · `owner-b` | 300 membres, 300 commandes, 684 articles, 6 retours, 7 sem. de ventes, 450 scans | **Le paywall doux** sur chaque surface (flou + « Demander le plan »), le **nudge scans** sur le dashboard, les demandes de plan sur `/platform` |
| `zz-test-focus-c` | **Tacos · 100 tickets · 40 clients · croissance** | Croissance · `owner-c` | 41 membres, 100 commandes, 222 articles, 6 retours, 7 sem. de ventes | Le resto « moyen » : fonctions Croissance débloquées, Repères (Pro) en essai 30 j à la 1ʳᵉ visite puis verrouillés |
| `zz-test-pizza-8` | **Seuils limite · 30 tickets · 20 clients** | Gratuit · `owner-bulk` | 20 membres, 30 commandes, 71 articles, 0 retour, 0 vente | Les états **« pas assez de données »** (prévisions, baromètre) et une fonction tout juste active (opportunités) |
| `zz-test-tacos-1` | **Caisse seule · 0 ticket · ventes 7 sem** | Gratuit · `owner-bulk` | 0 membre, 7 sem. de ventes importées | Prévisions **par import seul**, sans aucun scan (resto qui démarre par sa caisse) |
| `zz-test-sushi-4` | **Neuf · 0 ticket · 0 client** | Gratuit · `owner-bulk` | rien | Onboarding, états vides partout, console vierge |
| `zz-test-poulet-25` | **Équipes · 13 équipes · 500 clients · paliers** | Gratuit · `owner-bulk` | 520 membres, 13 équipes de 2 à 150 membres, ~660 commandes, `team_tiers` 500/1500/3000 € | **Tout ce qui touche aux équipes** : classement, paliers de score (Lycée Géant 16 000 pts franchit tout ; *Rue des Tilleuls* à 400 pts = « à 100 pts du 1ᵉʳ bonus »), paliers d'équipe couche 3 (Lycée Géant 6 662 € → les 3 ; Bureau Nord 1 872 € → 2 ; Réguliers 780 € → 1), page admin Équipes (ADR 0035), broadcasts par **type** (école/entreprise/rue/taxis/autre tous présents), changement d'équipe, équipes vides |
| `zz-test-burger-27` / `-7` / `-22` | **Multi-gérant 1/3 · 2/3 · 3/3** | Gratuit · **`owner-multi`** | fond réseau | **Un gérant, plusieurs restos** : sélecteur `/admin`, lien « Mes établissements », routage post-login → console |
| 40 autres `zz-test-*` | **Fond réseau — …** | inchangé · `owner-bulk` | 15–30 commandes chacun | Cohorte des Repères secteur (≥ 5 restos ≥ 10 cmd), volume réseau sur `/platform`, listes longues |

### Comptes membre utiles

- **`member-a`** : membre de **4 restos** (focus-a, focus-b, focus-c, Équipes) → sélecteur d'établissement, 4 états de cadeaux, réserve, coupon prêt, parrainage.
- **`super`** : super-admin → `/platform` (plans, demandes de plan, Membres, Mode plateforme sur n'importe quel resto).

## Rejouer / démonter

```bash
node scripts/seed-scenarios.mjs       # idempotent : complète jusqu'aux cibles, renomme
node scripts/seed-audit-clean.mjs     # démonte TOUT le jeu de test (préfixe + domaine)
```

Après un `seed-audit.mjs` complet, relancer `seed-scenarios.mjs` pour retrouver les scénarios.
