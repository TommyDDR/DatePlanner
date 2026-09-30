# Déploiement

_Source : research.md, R19._

## Décision

Procédure calquée sur laserit.fr (`deploy.md`) : la production sert un tag ; snapshot de la VM avant chaque déploiement ; `npm ci`, `prisma migrate deploy`, build, redémarrage de `dateplanner.service` (compte `dateplanner`, `/opt/dateplanner`, secrets lus par `EnvironmentFile`). Sauvegarde `pg_dump` chaque nuit, copiée hors de la VM ; journal borné à 500 Mo et un mois ; surveillance extérieure de `/api/sante`.

## Pourquoi

Constitution, « Contraintes d'exploitation » : savoir exactement ce qui tourne, revenir en arrière par un geste nommé, et apprendre une panne sans attendre qu'un utilisateur la signale.
