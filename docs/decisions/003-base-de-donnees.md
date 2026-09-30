# Base de données

_Source : research.md, R3._

## Décision

PostgreSQL 17 local à la VM, base `dateplanner`, rôle applicatif sans droit de création de base ; Prisma 7, migrations versionnées, `prisma migrate deploy` au déploiement. Les jours sont des colonnes `DATE`, jamais des horodatages.

## Pourquoi

Même moteur en développement, en test, en intégration continue et en production. `DATE` supprime toute question de fuseau à l'enregistrement. Écarté : SQLite, sans `LISTEN/NOTIFY` pour le direct et divergent des tests de laserit.fr.
