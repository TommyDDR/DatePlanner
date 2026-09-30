# Lien de partage

_Source : research.md, R7._

## Décision

Identifiant public aléatoire de 128 bits en base64url (22 caractères), distinct de l'identifiant interne : `https://dateplanner.laserit.fr/s/<identifiant>`. Une valeur mal formée ou inconnue répond « introuvable » (404).

## Pourquoi

128 bits rendent l'énumération hors de portée, même sans limitation de débit (FR-012). Écartés : un identifiant court lisible (devinable), l'identifiant interne (expose la clé primaire).
