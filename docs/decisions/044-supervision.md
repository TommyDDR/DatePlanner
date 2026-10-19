# Supervision

_Source : mise en place de la supervision de l'hyperviseur, octobre 2026 (décision 196 de laserit.fr)._

## Décision

DatePlanner est surveillé par la supervision de l'hyperviseur : conteneur 203 `supervision`, Prometheus, Loki et Grafana, alertes par email, battement vers Healthchecks.io, décrits et versionnés dans le dépôt de laserit.fr (`deploy/supervision/`). Ce dépôt ne porte que ce qui tourne sur le CT 202 : son Alloy (`deploy/supervision/dateplanner.alloy`), qui pousse les mesures de la machine, de PostgreSQL et de la file d'envoi (`dateplanner-queries.yaml`, un rôle `alloy` limité à trois colonnes d'`email_outbox`), et le journal des seules unités `dateplanner*`. Chaque erreur que Next capte y écrit une ligne `{"event":"server_error",…}` (`src/instrumentation.ts`) : la route et sa nature, jamais le message ni l'adresse demandée. Le journal est gardé trente jours, sur le conteneur comme sur la supervision (`SUPERVISION_RETENTION.logsDays`), et la politique de confidentialité l'annonce. Les noms des métriques et la ligne d'erreur sont ceux de laserit.fr : les mêmes règles d'alerte couvrent les deux services

## Pourquoi

personne ne lisait le journal, et `/api/sante` n'était interrogé par aucune sonde (§ 6.7 du README) : une panne ne se découvrait qu'en ouvrant le site. La supervision existait déjà pour laserit.fr, sur le même hyperviseur et derrière le même proxy : un second outil pour un second service ferait deux endroits où lire, et deux jeux de règles qui divergeraient. Rien ne quitte l'hyperviseur, sinon le battement de Healthchecks.io, qui ne porte aucune donnée d'utilisateur ; le journal recopié pouvant porter une adresse, sa durée est annoncée et tenue comme les autres
