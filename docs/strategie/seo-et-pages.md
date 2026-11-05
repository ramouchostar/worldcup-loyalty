# Référencement et pages restaurateurs — stratégie

> Document de travail (2026-11-01). Données : DataForSEO (Google Ads + Labs), Belgique (2056) en
> français et en néerlandais, France (2250) en renfort pour les formulations. Coût de la recherche :
> 0,97 $. Volumes = recherches mensuelles moyennes ; Google arrondit les petits volumes à 10.
> Fiche de base : [`.claude/product-marketing.md`](../../.claude/product-marketing.md).
>
> **Validé par Mehdi le 2026-11-01**, sauf le calculateur de food cost : **reporté** (« à voir par la suite »).
> Search Console est déjà active sur boosteats.be ; Mehdi soumet le sitemap et demande l'indexation des pages.

## 1. Ce que dit la recherche

**Le constat dur : en Belgique, presque personne ne cherche « un logiciel de fidélité pour restaurant ».**

| Ce qu'on vend | Recherche en Belgique (FR) | / mois |
|---|---|---|
| Fidélité | programme fidélité restaurant · carte fidélité restaurant · programme de fidélité restaurant | 10 chacun |
| | carte de fidélité digitale | 30 |
| | logiciel fidélité | 10 (CPC 16 €) |
| Pub | publicité restaurant · publicité pour restaurant · marketing restaurant | 10 chacun |
| Faire venir | comment attirer des clients dans un restaurant | 10 |
| Chiffres | chiffre d'affaires restaurant · rentabilité restaurant | 10 |

**Mais les restaurateurs cherchent autre chose, en plus grand nombre : les outils autour de leur restaurant.**

| Thème | Recherche en Belgique (FR) | / mois | Lien avec nous |
|---|---|---|---|
| **Coût des plats** | food cost | **170** (CPC 37,85 €) | Menu & coûts, cadeaux calculés sur le coût |
| | foodcost berekenen (NL) | 70 | idem |
| **Fiche Google** | fiche d'établissement google | **320** | Audit gratuit |
| | fiche établissement google · fiche google my business · fiche google business | 110 · 110 · 90 | Audit gratuit |
| **Avis Google** | avis google · avis sur google · google avis | 1 000 · 1 000 · 480 | Audit gratuit (une partie seulement vient de commerçants) |
| | suppression avis google · carte avis google · plaque avis google (FR : 1 300) | 40 · 40 · — | Audit gratuit |
| **Concurrent** | klantenkaart joyn · joyn klantenkaart (NL) | 170 · 170 | Page de comparaison |

**En France** (mêmes formulations, utile pour les questions et parce qu'un contenu en français se lit
aussi à Bruxelles) : carte de fidélité 5 400 · application carte de fidélité 1 300 · fiche google my
business 5 400 · fiche d'établissement google 4 400 · food cost 260 · food cost calculator 70 ·
carte de fidélité restaurant 90 · publicité pour restaurant 70 · comment attirer les clients dans un
restaurant 20. Concurrence faible partout (difficulté 0 à 22 sur 100), sauf « food cost restauration » (46).

### Ce qu'on en tire

1. **Le référencement ne remplira pas seul le carnet de rendez-vous.** Les recherches d'achat en
   Belgique se comptent en dizaines. La prospection sur le terrain (audit, visite) reste le moteur ;
   le référencement est le **deuxième canal**, qui travaille la nuit.
2. **On ne gagne pas sur le mot « fidélité », on gagne sur les outils.** Le restaurateur cherche
   « food cost », « fiche Google », « avis Google ». On répond à cette question, et on l'amène vers
   l'**audit gratuit** ou vers un **calculateur de coût des plats** : c'est là qu'on récupère son numéro.
3. **Les petites requêtes d'achat sont à prendre quand même** : personne ne les travaille (difficulté
   proche de 0), elles amènent des restaurateurs prêts à acheter. Une page de fonction par requête.
4. **Le néerlandais vient après.** Bruxelles est notre terrain, majoritairement francophone ; on ouvre
   le NL (klantenkaart, foodcost berekenen, Joyn) une fois les pages FR en place.

**Objectif mesurable** (Search Console, à brancher) : passer de ≈ 0 à **300 clics par mois en six
mois**, dont **30 audits lancés** depuis une page d'entrée. À revoir au bout de trois mois sur les vrais
chiffres. Aucun chiffre promis au restaurateur, seulement à nous.

## 2. Ce qui manque aujourd'hui (avant toute page)

- **Pas de `sitemap.xml` ni de `robots.txt`** : Google ne connaît pas la liste des pages.
- **Titre de l'accueil** : « Le copilote marketing des restaurants » parle d'une fonction non livrée
  et ne contient aucun mot que les restaurateurs tapent.
- **Description par défaut** (layout) : « fidélité communautaire par équipes… commandez directement »,
  l'ancien produit.
- **Aucune donnée structurée** (Organisation, Logiciel, FAQ).
- **Search Console** non branchée : on ne mesure ni les recherches ni les clics.

## 3. Le plan du site

```
/                                   Accueil : faire revenir + faire venir, audit en premier
│
├── Faire revenir
│   ├── /programme-fidelite-restaurant      La fidélité : le ticket en photo, des points, des cadeaux
│   ├── /cadeaux-calcules-sur-vos-couts     Les cadeaux au prix de revient, au taux choisi
│   └── /relancer-vos-clients               Messages aux clients, parrainage WhatsApp, QR de l'équipe
│
├── Faire venir
│   ├── /publicite-restaurant               La pub de quartier Facebook et Instagram, faite pour vous
│   └── /fiche-google-restaurant            Fiche Google et avis : ce qui compte, ce qu'on vérifie
│
├── Garder la main
│   ├── /chiffre-affaires-restaurant        Le CA du jour en un écran, la part des clients du programme
│   └── /food-cost-restaurant               Menu & coûts : le coût de chaque plat, la marge
│
├── L'analyse gratuite (aimant à contacts)
│   ├── /audit-gratuit                      Page pilier : « Analysez les performances de votre restaurant »
│   ├── /analyse-fiche-google-restaurant    « Votre fiche Google est-elle complète ? »
│   ├── /analyse-avis-google-restaurant     « Que disent vos avis Google ? »
│   ├── /visibilite-restaurant              « Votre restaurant est-il visible dans votre quartier ? »
│   └── /calculateur-food-cost              Outil gratuit : le coût et la marge d'un plat (2e aimant)
│
└── Comparer
    └── /alternative-joyn                   Joyn ou Boosteats (à faits vérifiés uniquement — phase 2)
```

Chaque page de fonction répond à **une** recherche et suit la même trame : le problème dit avec les
mots du restaurateur · ce qu'on fait · ce qu'il a à faire · ce qu'il voit (capture de la console) ·
comment on arrive au résultat (la méthode, jamais la technique) · questions fréquentes · appel à
l'action vers l'audit gratuit.

### Les pages d'analyse : même outil, angles différents

Le même formulaire (`RestaurantSearchBar` → audit) sous plusieurs titres, chacun pour une recherche.
**Garde-fou Google** : des pages quasi identiques sont traitées comme des « pages satellites » et
déclassées. Chaque page porte donc son **propre contenu utile** (≥ 400 mots) : ce que regarde l'analyse
sur ce thème précis, à quoi ressemble une bonne fiche, la liste de contrôle, les erreurs fréquentes,
une FAQ propre. L'outil est le même, la réponse à la question ne l'est pas.

| Page | Titre (balise title) | Grand titre | Recherche visée |
|---|---|---|---|
| /audit-gratuit | Analyse gratuite de votre restaurant : note sur 100 | Analysez les performances de votre restaurant | audit restaurant, analyse restaurant |
| /analyse-fiche-google-restaurant | Fiche d'établissement Google d'un restaurant : l'analyse gratuite | Votre fiche Google donne-t-elle envie d'entrer ? | fiche d'établissement google, fiche google my business |
| /analyse-avis-google-restaurant | Avis Google de votre restaurant : analyse gratuite | Ce que vos avis Google disent de votre restaurant | avis google restaurant, google avis clients |
| /visibilite-restaurant | Visibilité de votre restaurant sur Google Maps : le test gratuit | Votre restaurant est-il visible dans votre quartier ? | visibilité restaurant, notoriété restaurant |
| /calculateur-food-cost | Calcul du food cost : calculateur gratuit pour restaurant | Combien vous coûte vraiment chaque plat ? | food cost, calcul food cost, food cost calculator |

### L'accueil

- **Balise title** : « Programme de fidélité et pub pour restaurants — Boosteats »
- **Grand titre** : garder « Fini la salle vide / le jeudi soir creux… », c'est concret et ça marche à
  l'œil ; le sous-titre porte les mots-clés : « Faites revenir vos clients et faites venir le quartier.
  Rien à brancher : le ticket de caisse suffit. »
- **Premier appel à l'action** : la recherche de l'établissement (déjà en place) avec un libellé plus
  fort : « Analysez votre restaurant gratuitement — note sur 100 en une minute ».
- Puis les **trois piliers**, chacun avec deux ou trois fonctions qui renvoient à leur page.
- Puis les **plans**, Gratuit en premier.
- Le tableau des plans ne liste plus que ce qui est livré ; le reste en « bientôt ».

## 4. La base technique (une seule PR, avant les pages)

`app/sitemap.ts` et `app/robots.ts` (liste unique : `lib/seo-pages.ts`), métadonnées propres (accueil,
layout, audit, inscription), données structurées `Organization` + `SoftwareApplication` (accueil) puis
`FAQPage` (pages avec FAQ), balise `canonical`. Search Console : déjà vérifiée.

## 5. Ordre de construction

1. **Base technique** : sitemap, robots, titres, données structurées, Search Console.
2. **Accueil** remis à plat + **/audit-gratuit** renforcée (la page pilier de l'aimant).
3. **Trois pages d'analyse** (fiche Google, avis, visibilité).
4. **Sept pages de fonction**.
5. ~~Calculateur de food cost~~ — **reporté** (décision du 2026-11-01).
6. **Guides** (phase 2) : « Comment calculer son food cost », « Répondre aux avis Google »,
   « Remplir sa fiche Google quand on est un restaurant », « Comment attirer des clients dans son
   restaurant » ; puis les pages en néerlandais et /alternative-joyn.

## 5 bis. Comparatifs avec les concurrents (décidé par Mehdi le 2026-11-05)

Nommer les concurrents attire les restaurateurs qui cherchent « Joyn prix », « alternative à Malou »,
« agence pub Facebook restaurant prix ». Donc :

- **Section 3 de l'accueil** « Sept abonnements ailleurs. Un seul forfait chez nous. »
  (`components/restaurateurs/ComparisonSection.tsx`) : chaque poste, 2 ou 3 marques avec leur prix public,
  la moyenne retenue, et le total par forfait. Chaque marque mène à son article.
- **12 articles « X ou Boosteats »** (catégorie « Comparatifs » du blog) + l'article pilier
  « Combien coûte le marketing d'un restaurant ? ». Plan fixe : en bref (tableau), ce que X fait bien,
  ce que Boosteats fait autrement, **ce que Boosteats ne fait pas**, le prix, quand choisir X.
- **Une seule source** pour les prix : `lib/comparatif.ts` (marque, prix, page de relevé, article).

Règles (publicité comparative, Code de droit économique art. VI.17 : objective, vérifiable, sans
dénigrement) :
- prix **publics**, HTVA, datés, arrondis, avec la source ; moyennes prudentes (fidélité à 50 €) ;
- **relire les prix tous les six mois** : `lib/comparatif.test.ts` échoue 200 jours après
  `COMPARISON_CHECKED` ;
- dire les forces du concurrent et nos manques (pas de SMS, pas de branchement caisse, pas de
  stocks, pas de réservation) ; Nina et Max « en pilote » ;
- les petites agences belges sont citées dans le tableau, jamais dans un article « contre » elles :
  l'article compare le modèle « agence » ;
- pas d'Owner.com (absent d'Europe) : le site se compare à un développeur (≈ 700 € à la création,
  hors total mensuel).

## 6. Ce qu'on ne fait pas

- Des pages par commune au texte identique (« fidélité restaurant Ixelles », « … Uccle ») : sanctionné.
- Parler de technique (lecture du ticket, modèles d'IA) : c'est notre fabrication.
- Promettre un résultat chiffré au restaurateur.
- Présenter au présent une fonction non livrée.
