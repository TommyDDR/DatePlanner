# Comptes locaux et sessions

_Source : research.md, R4._

## Décision

Mot de passe haché en argon2id, règle CNIL de laserit.fr (10 caractères, quatre classes). Sessions en base : cookie `HttpOnly`, `Secure` en production, `SameSite=Lax`, jeton de 256 bits dont seule l'empreinte SHA-256 est stockée, échéance glissante de 30 jours, plafond de 90 jours. Échec de connexion générique, hachage factice pour un compte inconnu, verrou progressif, seaux par adresse. Réinitialisation par jeton à usage unique d'une heure, sessions fermées ensuite. Pas de vérification d'adresse préalable, mais une adresse est « prouvée » dès qu'un lien envoyé y a servi ou que Google l'a vérifiée.

## Pourquoi

Ce sont les invariants de sécurité de laserit.fr (constitution I). Un jeton à haute entropie n'a pas besoin d'un hachage lent. Écartés : JWT sans état (révocation impossible après réinitialisation), vérification obligatoire de l'adresse (friction refusée par la spec).
