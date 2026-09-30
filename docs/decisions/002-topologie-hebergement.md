# Topologie d'hébergement

_Source : research.md, R2._

## Décision

Une VM Proxmox dédiée, VM 102 `dateplanner` (`192.168.1.53`, bail DHCP statique), Debian, avec Node 22 et son propre PostgreSQL 17. La VM proxy existante (`192.168.1.51`, Traefik et CrowdSec) reçoit un second fichier dynamique `dateplanner.yml`. Le pare-feu de la VM n'ouvre le port 3000 qu'à la VM proxy. DNS : CNAME `dateplanner` vers `laserit.fr.` dans la zone OVH.

## Pourquoi

Base, comptes, cycle de déploiement et snapshot propres : une mise à jour de DatePlanner ne peut pas faire tomber laserit.fr. Le proxy fait déjà les réglages indispensables (en-têtes de confiance, SSE sans tampon) et CrowdSec protège le nouveau domaine sans configuration. Le CNAME suit l'adresse publique de `laserit.fr` si elle change. Écartés : la VM de laserit.fr avec une seconde base (snapshot et redémarrages partagés), Docker (brique d'exploitation absente de l'infrastructure).
