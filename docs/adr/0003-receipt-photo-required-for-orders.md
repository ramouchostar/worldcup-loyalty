# La photo du ticket de caisse est obligatoire pour toute soumission de commande

Chaque commande soumise doit être accompagnée d'une photo du ticket de caisse client (pas le ticket caissier/cuisine), stockée dans Supabase Storage bucket `receipts` (privé). L'anti-doublon repose sur le **Bestelnummer** extrait par OCR — identifiant séquentiel unique généré par la caisse Belchicken (format `YYYY-MM-DD/NNN/NNNNN`, ex. `2026-06-01/258/03993`).

## Pourquoi pas la confiance seule

Sans preuve visuelle, n'importe qui peut soumettre un montant arbitraire. La photo du ticket dissuade ~95% des fraudes avec un coût de développement minimal.

## Pourquoi le Bestelnummer et pas DATE+HH:MM+MONTANT

L'ancien `duplicate_key = DATE + HEURE(HH:MM) + MONTANT` permettait des collisions théoriques (deux clients commandant le même montant à la même minute). Le Bestelnummer est généré séquentiellement par la caisse — il est garanti unique par restaurant par jour. Il encode aussi le restaurant (`/223/` = Kraainem, `/258/` = Houba), ce qui permet une validation croisée automatique avec la variable `NEXT_PUBLIC_RESTAURANT_ID`.

## Ticket client vs ticket caissier

Belchicken génère deux tickets par commande :
- **Ticket caissier/cuisine** : minimal, sans header restaurant — rejeté automatiquement par l'OCR si soumis
- **Ticket client** : header complet (nom restaurant, adresse, BTW), Bestelnummer, section EFT si carte — c'est la seule version acceptée

La détection du header restaurant ("Belchicken [NOM]") est une condition de validation automatique.

## Pourquoi pas le QR code du ticket

Chaque ticket Belchicken porte un QR code en bas ("Rate Your Experience"). Ce QR pointe vers `belpeople.com/nps` — une URL générique de satisfaction client, commune à tous les tickets. Il n'encode pas les données de commande et ne peut pas servir d'identifiant unique. Canal de scan inutilisable pour notre programme.

## Validation automatique — seuls les cas suspects passent par l'admin

La grande majorité des soumissions est auto-validée (voir ADR 0008). L'admin ne voit dans `/admin/orders` que les commandes flaggées (montant > €200, OCR incertain, 3+ commandes/jour même membre, écart montant > 5%).

## Conséquence

- Le formulaire `/submit-order` requiert un upload d'image avant soumission
- Le champ `order_number` (Bestelnummer) remplace `duplicate_key` — contrainte `UNIQUE` en base
- Le bucket `receipts` est privé — la photo n'est accessible qu'aux admins en cas de litige
