# Jours et fuseau

_Source : research.md, R17._

## Décision

Un jour est une chaîne `AAAA-MM-JJ` dans le code et une colonne `DATE` en base ; « aujourd'hui » est la date courante à `Europe/Paris`, calculée par le serveur ; un jour est passé s'il est strictement antérieur.

## Pourquoi

Les sondages portent sur des jours entiers. Comparé à une date UTC, un sondage créé à 0 h 30 refuserait le jour même comme déjà passé.
