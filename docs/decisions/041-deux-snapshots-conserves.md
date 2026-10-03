# Deux snapshots conservés

_Source : exploitation après la version 0.6.0._

## Décision

Le snapshot d'avant déploiement est pris par `deploy/dateplanner-snapshot.sh`, installé sur l'hôte Proxmox en `/usr/local/sbin/dateplanner-snapshot` et appelé par `ssh root@192.168.1.10 dateplanner-snapshot vX.Y.Z`. Le script prend `avant_vX_Y_Z`, puis supprime les snapshots `avant_*` de la VM 102 au-delà des deux plus récents, classés par date de prise. Il ne supprime rien si la prise échoue, et ne touche jamais un snapshot nommé autrement. `SNAPSHOT_KEEP` change le nombre conservé.

## Pourquoi

La suppression « quelques jours plus tard » de `deploy.md` ne se faisait pas : huit snapshots s'étaient empilés en quatre jours, et un snapshot LVM-thin grossit à chaque écriture sur le disque. Deux suffisent : celui du dernier déploiement ramène la version d'avant, et celui du précédent couvre un défaut découvert après coup. Faire le ménage au moment de la prise le rend impossible à oublier, sans minuteur de plus sur l'hôte. Les snapshots nommés à la main restent à la main.
