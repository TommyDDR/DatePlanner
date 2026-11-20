# Un seul snapshot conservé

_Source : demande de l'exploitant, remplace la décision « Deux snapshots conservés »._

## Décision

Le snapshot d'avant déploiement est pris par `deploy/dateplanner-snapshot.sh`, installé sur l'hôte Proxmox en `/usr/local/sbin/dateplanner-snapshot` et appelé par `ssh root@192.168.1.10 dateplanner-snapshot vX.Y.Z`. Le script prend `avant_vX_Y_Z`, puis supprime les autres snapshots `avant_*` du conteneur 202, classés par date de prise. Il ne supprime rien si la prise échoue, et ne touche jamais un snapshot nommé autrement. `SNAPSHOT_KEEP` change le nombre conservé.

## Pourquoi

Un snapshot LVM-thin grossit à chaque écriture sur le disque, et une seule ancienne version gardée suffit : le snapshot du dernier déploiement ramène la version d'avant. Reculer de deux versions par un snapshot n'est plus possible ; un point de retour à garder plus longtemps se prend à la main sous un autre nom. Faire le ménage au moment de la prise le rend impossible à oublier, sans minuteur de plus sur l'hôte. Les snapshots nommés à la main restent à la main.
