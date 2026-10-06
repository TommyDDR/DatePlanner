# Conteneur LXC

_Source : passage de tout l'hyperviseur en conteneurs, octobre 2026._

## Décision

DatePlanner tourne dans un conteneur LXC non privilégié de Proxmox, CT 202 `dateplanner`, avec `nesting=1`, créé depuis le modèle Debian 13 et réinstallé, jamais converti depuis le disque de l'ancienne VM 102. Il reprend son adresse (`192.168.1.53`) et sa MAC : la route Traefik ne change pas. Le pare-feu est celui de Proxmox, décrit sur l'hôte (`/etc/pve/firewall/202.fw`), et `ufw` n'est plus installé. Le snapshot de déploiement passe par `pct` (`deploy/dateplanner-snapshot.sh`). Le proxy et laserit.fr font le même chemin (CT 201 et 200, décision 178 de laserit.fr).

## Pourquoi

Demandé par l'exploitant, pour toute la machine. Proxmox lit la mémoire réellement utilisée d'un conteneur, là où celle d'une VM est l'empreinte du processus QEMU, cache compris ; plus de cloud-init, qui régénère les clés SSH quand il se croit sur une nouvelle instance ; un démarrage en quelques secondes ; un shell depuis l'hôte sans passer par le réseau (`pct enter 202`). Le prix, assumé : un conteneur partage le noyau de l'hôte, et une faille du service suivie d'une faille du noyau donne l'hôte entier, là où une VM demandait en plus de sortir de l'hyperviseur. Ce qui le borne : un conteneur non privilégié, dont le root n'est personne sur l'hôte, le profil AppArmor de Proxmox, aucun périphérique transmis. `nesting=1` est exigé par systemd de Debian 13 et par le cloisonnement de `dateplanner.service`. Le pare-feu de Proxmox plutôt qu'`ufw` : décrit sur l'hôte, il est hors de portée du conteneur. Une réinstallation plutôt qu'une conversion : la VM convertie traînerait noyau, chargeur de démarrage, cloud-init, agent QEMU et `fstab`, alors que la configuration est déjà dans `deploy/`.
