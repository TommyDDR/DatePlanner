# Topologie d'hébergement

_Source : research.md, R2._

## Décision

Une machine dédiée sur l'hyperviseur Proxmox, le conteneur 202 `dateplanner` (`192.168.1.53`, décision 043), Debian, avec Node 22 et son propre PostgreSQL 17. Le conteneur proxy existant (`192.168.1.51`, Traefik et CrowdSec) reçoit un second fichier dynamique `dateplanner.yml`. Le pare-feu de Proxmox n'ouvre le port 3000 de DatePlanner qu'au proxy. DNS : CNAME `dateplanner` vers `laserit.fr.` dans la zone OVH.

## Pourquoi

Base, comptes, cycle de déploiement et snapshot propres : une mise à jour de DatePlanner ne peut pas faire tomber laserit.fr. Le proxy fait déjà les réglages indispensables (en-têtes de confiance, SSE sans tampon) et CrowdSec protège le nouveau domaine sans configuration. Le CNAME suit l'adresse publique de `laserit.fr` si elle change. Écartés : la machine de laserit.fr avec une seconde base (snapshot et redémarrages partagés), Docker (brique d'exploitation absente de l'infrastructure).
