# ADR 0036 — Conserver les tickets scannés 30 jours

**Statut** : Accepté (2026-08-20). Amende l'**ADR 0025 §7** (durée de conservation des reçus). Complète l'**ADR 0019** (clé de ticket découverte par établissement), l'**ADR 0029 §6** (métering des scans) et l'**ADR 0033** (console plateforme). Ne change rien à l'**ADR 0008** (auto-validation) ni à l'**ADR 0003** (bucket privé).

## Contexte

Le pipeline de scan fait deux appels Claude Vision distincts :

1. `POST /api/orders/parse-receipt` — l'aperçu rendu au membre (« montant détecté : 36,10 € ») ;
2. `POST /api/orders` — la ré-analyse serveur, seule source de vérité anti-fraude (ADR 0008).

Seul le second gardait la photo, et **uniquement si la soumission allait au bout**. Le premier envoyait l'image au modèle puis la jetait.

Conséquence : tout ce qui échoue entre les deux ne laisse **aucune trace**. Un ticket refusé à l'entête (« ça ne ressemble pas à un ticket Belchicken Kraainem »), un membre qui abandonne devant le formulaire, un refus serveur — plus rien à regarder ensuite. Les 6 scans perdus de Kraainem des 18-19/08/2026 (ADR 0034) ont été diagnostiqués **par déduction**, faute de pouvoir ouvrir une seule des six images.

Il manque aussi, plus banalement, de quoi répondre à la question « est-ce que l'OCR lit juste ? ». Comparer **ce qu'il y a sur le ticket** avec **ce que le modèle a lu** et **ce que l'app a encodé** demande de garder l'image un moment.

## Décision

### 1. Toute image passée à Vision est conservée

`receipt_scans` (m58) porte une ligne par appel OCR : le chemin de l'image dans le bucket privé, la lecture brute du modèle (numéro, montant, confiance, heure, articles, entête reconnue ou non), et ce que le scan est devenu :

| `outcome`         | Signification                                              |
|-------------------|------------------------------------------------------------|
| `parsed`          | lu et rendu au membre, pas (encore) soumis                  |
| `header_rejected` | refusé à l'aperçu — l'entête ne correspond pas au resto     |
| `submitted`       | devenu la commande `order_id`                               |

La conservation est **best-effort** : un échec d'écriture n'interrompt jamais le scan d'un membre — même philosophie que le métering (ADR 0029 §6) et le rate-limit.

### 2. Une seule photo par scan, pas deux

L'aperçu range l'image et renvoie un `scan_id` opaque. La soumission le repasse au serveur, qui **vérifie l'appartenance** (même membre, même établissement, moins de deux heures) et pointe `orders.receipt_url` sur le fichier déjà stocké. Un jeton absent, forgé ou périmé retombe simplement sur l'upload d'origine — aucun chemin ne dépend du client.

### 3. Rétention : 30 jours pour toute image, sans exception

Passé 30 jours, la purge quotidienne (`/api/cron/purge-receipts`, 3 h du matin) efface **le fichier** — celui d'un scan comme celui d'une commande, y compris les images déposées avant cet ADR. Les lignes, elles, restent : `orders` est une pièce comptable, `receipt_scans` une statistique de lecture. Une ligne purgée garde sa lecture OCR et porte `purged_at`.

Ce point **amende l'ADR 0025 §7**, qui rangeait les reçus avec les pièces comptables à conserver 7 ans. La distinction retenue : la **pièce comptable est le ticket du restaurateur**, dans sa caisse — la photo prise par un membre est une **preuve anti-fraude** au service de la validation, dont l'utilité s'éteint une fois la commande validée et le cadeau remis. Ce qui doit survivre 7 ans (montant, date, numéro de commande, statut) survit : c'est la ligne, pas l'image.

Trente jours couvrent largement le cycle utile : validation (file admin), coupon 48 h (ADR 0011), contestation d'un membre, et le recul nécessaire pour juger l'OCR au démarrage.

### 4. La comparaison se regarde côté plateforme, pas côté restaurateur

`/platform/scans` (super-admin) aligne pour chaque scan : la vignette de l'image, la lecture de Vision, l'encodage final, et la colonne **Écart** quand les deux divergent. Plus le taux de scans jamais soumis et d'entêtes refusées — les deux fuites invisibles jusqu'ici.

La confiance OCR et les motifs de flag sont des internes anti-fraude (ADR 0019) : ni le membre ni le restaurateur n'y ont accès. Le restaurateur continue de voir la photo des tickets de **sa** file de validation, comme avant.

### 5. Droit à l'effacement immédiat

`deleteUserData` (ADR 0025) supprime les images du membre sans attendre les 30 jours et efface ses lignes `receipt_scans`. Les commandes restent, désormais sans photo. L'export de portabilité inclut les lectures OCR le concernant, jamais le chemin de stockage.

## Conséquences

- Deux surfaces nouvelles à surveiller : le volume du bucket (borné par la rétention, ce qu'il n'était pas) et le coût d'un stockage systématique — négligeable devant le coût Vision.
- Un scan abandonné devient **visible** : c'est le premier indicateur de friction du parcours qu'on ait jamais eu.
- La purge est idempotente et rejouable ; en cas de panne prolongée du cron, un rattrapage efface simplement tout le retard.
- À faire quand le recul sera pris : décider si 30 jours restent le bon réglage (`RECEIPT_RETENTION_DAYS`), et si le taux d'abandon mérite une alerte plutôt qu'une colonne.

## Alternatives rejetées

**Ne garder que les tickets soumis (statu quo).** C'est précisément ce qui a rendu les 6 scans de Kraainem indéchiffrables. Les échecs sont ce qu'on a le plus besoin de voir.

**Conserver indéfiniment.** Accumulation illimitée de photos nominatives pour un besoin qui s'éteint en quelques semaines — contraire à la minimisation (ADR 0025 §7) et indéfendable devant l'APD.

**Ne garder que la lecture OCR, sans l'image.** Ça fait exactement le contraire de ce qu'on cherche : sans l'image, impossible de savoir si le modèle a mal lu ou si le ticket était illisible.

**Exposer la comparaison au restaurateur.** Elle porte la confiance OCR et les motifs de flag, c'est-à-dire la mécanique anti-fraude. La donner, c'est apprendre à la contourner.
