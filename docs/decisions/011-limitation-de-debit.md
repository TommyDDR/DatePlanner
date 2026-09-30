# Limitation de débit

_Source : research.md, R11._

## Décision

Fenêtres glissantes en base, adresse lue dans `X-Real-IP` posé par Traefik, `RATE_LIMIT_ALLOWLIST` pour l'exploitant. Connexion 10/15 min par adresse ; inscription 5/h ; mot de passe oublié 3/h par adresse et par compte ; création de sondage 20/h par compte ; réponse 30/h par adresse et 10/h par sondage et adresse ; 6 flux SSE par adresse. Champ leurre sur les formulaires publics.

## Pourquoi

Le volume ne justifie pas Redis. Écarté en v1 : un captcha, service tiers et traitement de données de plus pour un risque que les seaux couvrent, à réévaluer si le bourrage se produit.
